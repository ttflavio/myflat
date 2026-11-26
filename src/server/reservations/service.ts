// Casos de uso de reservas e bloqueios. Toda mudança de agenda passa por aqui:
// valida no domínio, grava em transação e deixa o PostgreSQL ter a última palavra
// sobre sobreposição (constraint occupancies_no_overlap).
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { BlockReason, Channel, OccupancyKind } from "@/generated/prisma/enums";
import { fromUtcDate, isIsoDate, toUtcDate } from "@/domain/availability/dates";
import { validateStay } from "@/domain/availability/stay";
import { canTransition, occupiesCalendar, type ReservationStatus } from "@/domain/reservations/status";
import type { Db } from "../db";
import {
  AvailabilityConflictError,
  InvalidTransitionError,
  isOverlapViolation,
  NotFoundError,
  ValidationError,
  type ConflictingOccupancy,
} from "../errors";
import { assertCan, type TenantContext } from "../tenant";

type Tx = Prisma.TransactionClient;

const isoDate = z.string().refine(isIsoDate, "Data no formato AAAA-MM-DD");
const money = z.number().nonnegative().max(10_000_000);
const STAY_MESSAGES = {
  invalid_date: "Data inválida.",
  checkout_not_after_checkin: "O check-out precisa ser depois do check-in.",
  too_long: "Estadia acima de 365 noites.",
} as const;

export const createReservationInput = z.object({
  unitId: z.string().uuid(),
  channel: z.enum(["AIRBNB", "BOOKING", "DECOLAR", "WHATSAPP", "DIRECT", "MANUAL", "OTHER"]),
  status: z.enum(["INQUIRY", "AWAITING_CONFIRM", "HOLD", "CONFIRMED"]).default("CONFIRMED"),
  checkIn: isoDate,
  checkOut: isoDate,
  guestCount: z.number().int().min(1).max(50).default(1),
  guest: z
    .object({
      name: z.string().trim().min(1).max(160),
      phone: z.string().trim().max(40).optional(),
      email: z.string().trim().email().optional(),
    })
    .optional(),
  totalAmount: money.default(0),
  channelFee: money.default(0),
  externalRef: z.string().trim().max(120).optional(),
  holdHours: z.number().int().min(1).max(24 * 14).default(24),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateReservationInput = z.input<typeof createReservationInput>;

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError("Dados inválidos.", r.error.issues);
  return r.data;
}

function assertStay(checkIn: string, checkOut: string) {
  const err = validateStay({ checkIn, checkOut });
  if (err) throw new ValidationError(STAY_MESSAGES[err]);
}

async function findUnit(tx: Tx, ctx: TenantContext, unitId: string) {
  const unit = await tx.unit.findFirst({ where: { id: unitId, organizationId: ctx.organizationId } });
  if (!unit) throw new NotFoundError("Imóvel");
  return unit;
}

/** Ocupações ativas que colidem com o intervalo (para explicar o erro ao usuário). */
export async function findOverlapping(
  db: Db | Tx,
  organizationId: string,
  unitId: string,
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Promise<ConflictingOccupancy[]> {
  const rows = await db.occupancy.findMany({
    where: {
      organizationId,
      unitId,
      isActive: true,
      checkIn: { lt: toUtcDate(checkOut) },
      checkOut: { gt: toUtcDate(checkIn) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: { reservation: { select: { code: true } } },
    orderBy: { checkIn: "asc" },
  });
  return rows.map((o) => ({
    id: o.id,
    kind: o.kind,
    checkIn: fromUtcDate(o.checkIn),
    checkOut: fromUtcDate(o.checkOut),
    reservationCode: o.reservation?.code ?? null,
    note: o.note,
  }));
}

/** Converte a violação da constraint num erro com as ocupações em conflito. */
async function withConflictReport<T>(
  db: Db,
  where: { organizationId: string; unitId: string; checkIn: string; checkOut: string; excludeId?: string },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isOverlapViolation(err)) {
      const conflicts = await findOverlapping(db, where.organizationId, where.unitId, where.checkIn, where.checkOut, where.excludeId);
      throw new AvailabilityConflictError(conflicts);
    }
    throw err;
  }
}

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `MF-${s}`;
}

async function logAvailability(
  tx: Tx,
  ctx: TenantContext,
  data: { unitId: string; occupancyId: string | null; action: string; before?: object; after?: object; source?: string },
) {
  await tx.availabilityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      unitId: data.unitId,
      occupancyId: data.occupancyId,
      action: data.action,
      before: data.before ?? Prisma.JsonNull,
      after: data.after ?? Prisma.JsonNull,
      actorUserId: ctx.userId,
      source: data.source ?? "ui",
    },
  });
}

async function audit(tx: Tx, ctx: TenantContext, entity: string, entityId: string, action: string, data?: object) {
  await tx.auditLog.create({
    data: { organizationId: ctx.organizationId, actorUserId: ctx.userId, entity, entityId, action, data: data ?? Prisma.JsonNull },
  });
}

/** Pré-reservas vencidas deixam de ocupar a agenda e são canceladas. */
export async function expireHolds(tx: Tx, ctx: TenantContext, now = new Date(), unitId?: string): Promise<number> {
  const expired = await tx.reservation.findMany({
    where: { organizationId: ctx.organizationId, status: "HOLD", holdExpiresAt: { lte: now }, ...(unitId ? { unitId } : {}) },
    select: { id: true, unitId: true },
  });
  for (const r of expired) {
    await tx.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", notes: "Pré-reserva expirada." } });
    const occ = await tx.occupancy.updateManyAndReturn({ where: { reservationId: r.id, isActive: true }, data: { isActive: false } });
    for (const o of occ) await logAvailability(tx, ctx, { unitId: r.unitId, occupancyId: o.id, action: "released", after: { reason: "hold_expired" }, source: "job" });
    await audit(tx, ctx, "reservation", r.id, "hold_expired");
  }
  return expired.length;
}

export async function createReservation(db: Db, ctx: TenantContext, raw: CreateReservationInput, now = new Date()) {
  assertCan(ctx, "reservation:write");
  const input = parse(createReservationInput, raw);
  assertStay(input.checkIn, input.checkOut);
  const channelFee = Math.min(input.channelFee, input.totalAmount);

  return withConflictReport(db, { organizationId: ctx.organizationId, unitId: input.unitId, checkIn: input.checkIn, checkOut: input.checkOut }, () =>
    db.$transaction(async (tx) => {
      const unit = await findUnit(tx, ctx, input.unitId);
      // Capacidade só é checada quando foi cadastrada.
      if (unit.maxGuests != null && input.guestCount > unit.maxGuests) {
        throw new ValidationError(`O flat ${unit.code} recebe no máximo ${unit.maxGuests} hóspedes.`);
      }
      await expireHolds(tx, ctx, now, unit.id);

      const guest = input.guest
        ? await tx.guest.create({ data: { organizationId: ctx.organizationId, ...input.guest } })
        : null;
      const holdExpiresAt = input.status === "HOLD" ? new Date(now.getTime() + input.holdHours * 3_600_000) : null;

      const reservation = await tx.reservation.create({
        data: {
          organizationId: ctx.organizationId,
          unitId: unit.id,
          guestId: guest?.id,
          code: newCode(),
          channel: input.channel,
          externalRef: input.externalRef,
          status: input.status,
          checkIn: toUtcDate(input.checkIn),
          checkOut: toUtcDate(input.checkOut),
          guestCount: input.guestCount,
          totalAmount: new Prisma.Decimal(input.totalAmount),
          channelFee: new Prisma.Decimal(channelFee),
          netAmount: new Prisma.Decimal(input.totalAmount - channelFee),
          holdExpiresAt,
          notes: input.notes,
          createdById: ctx.userId,
        },
      });

      if (occupiesCalendar(input.status, holdExpiresAt, now)) {
        const occ = await tx.occupancy.create({
          data: {
            organizationId: ctx.organizationId,
            unitId: unit.id,
            kind: "RESERVATION",
            checkIn: reservation.checkIn,
            checkOut: reservation.checkOut,
            source: input.channel,
            reservationId: reservation.id,
          },
        });
        await logAvailability(tx, ctx, { unitId: unit.id, occupancyId: occ.id, action: "created", after: { checkIn: input.checkIn, checkOut: input.checkOut, reservation: reservation.code } });
      }
      await audit(tx, ctx, "reservation", reservation.id, "created", { status: input.status, channel: input.channel });
      return reservation;
    }),
  );
}

async function findReservation(tx: Tx, ctx: TenantContext, id: string) {
  const r = await tx.reservation.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { occupancy: true } });
  if (!r) throw new NotFoundError("Reserva");
  return r;
}

export async function changeReservationStatus(db: Db, ctx: TenantContext, id: string, to: ReservationStatus, now = new Date()) {
  assertCan(ctx, "reservation:write");
  const current = await db.reservation.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!current) throw new NotFoundError("Reserva");
  const range = { organizationId: ctx.organizationId, unitId: current.unitId, checkIn: fromUtcDate(current.checkIn), checkOut: fromUtcDate(current.checkOut) };

  return withConflictReport(db, range, () =>
    db.$transaction(async (tx) => {
      const r = await findReservation(tx, ctx, id);
      if (!canTransition(r.status, to)) throw new InvalidTransitionError(r.status, to);
      const updated = await tx.reservation.update({ where: { id: r.id }, data: { status: to, holdExpiresAt: to === "HOLD" ? r.holdExpiresAt : null } });
      const shouldOccupy = occupiesCalendar(to, updated.holdExpiresAt, now);

      if (shouldOccupy && !r.occupancy) {
        const occ = await tx.occupancy.create({
          data: { organizationId: r.organizationId, unitId: r.unitId, kind: "RESERVATION", checkIn: r.checkIn, checkOut: r.checkOut, source: r.channel, reservationId: r.id },
        });
        await logAvailability(tx, ctx, { unitId: r.unitId, occupancyId: occ.id, action: "created", after: { status: to } });
      } else if (r.occupancy && r.occupancy.isActive !== shouldOccupy) {
        await tx.occupancy.update({ where: { id: r.occupancy.id }, data: { isActive: shouldOccupy } });
        await logAvailability(tx, ctx, { unitId: r.unitId, occupancyId: r.occupancy.id, action: shouldOccupy ? "reactivated" : "released", after: { status: to } });
      }
      await audit(tx, ctx, "reservation", r.id, "status_changed", { from: r.status, to });
      return updated;
    }),
  );
}

export async function changeReservationDates(db: Db, ctx: TenantContext, id: string, dates: { checkIn: string; checkOut: string }) {
  assertCan(ctx, "reservation:write");
  assertStay(dates.checkIn, dates.checkOut);
  const current = await db.reservation.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { occupancy: true } });
  if (!current) throw new NotFoundError("Reserva");
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(current.status)) {
    throw new ValidationError("Reserva encerrada não pode mudar de datas.");
  }

  return withConflictReport(
    db,
    { organizationId: ctx.organizationId, unitId: current.unitId, ...dates, excludeId: current.occupancy?.id },
    () =>
      db.$transaction(async (tx) => {
        const r = await findReservation(tx, ctx, id);
        const before = { checkIn: fromUtcDate(r.checkIn), checkOut: fromUtcDate(r.checkOut) };
        const updated = await tx.reservation.update({ where: { id: r.id }, data: { checkIn: toUtcDate(dates.checkIn), checkOut: toUtcDate(dates.checkOut) } });
        if (r.occupancy) {
          await tx.occupancy.update({ where: { id: r.occupancy.id }, data: { checkIn: updated.checkIn, checkOut: updated.checkOut } });
          await logAvailability(tx, ctx, { unitId: r.unitId, occupancyId: r.occupancy.id, action: "dates_changed", before, after: dates });
        }
        await audit(tx, ctx, "reservation", r.id, "dates_changed", { before, after: dates });
        return updated;
      }),
  );
}

export const createBlockInput = z.object({
  unitId: z.string().uuid(),
  checkIn: isoDate,
  checkOut: isoDate,
  reason: z.enum(["MAINTENANCE", "OWNER_USE", "CLEANING", "ADMINISTRATIVE", "OTHER"]),
  note: z.string().trim().max(500).optional(),
});

export async function createBlock(db: Db, ctx: TenantContext, raw: z.input<typeof createBlockInput>) {
  assertCan(ctx, "availability:block");
  const input = parse(createBlockInput, raw);
  assertStay(input.checkIn, input.checkOut);
  return withConflictReport(db, { organizationId: ctx.organizationId, ...input }, () =>
    db.$transaction(async (tx) => {
      const unit = await findUnit(tx, ctx, input.unitId);
      const occ = await tx.occupancy.create({
        data: {
          organizationId: ctx.organizationId,
          unitId: unit.id,
          kind: "BLOCK" satisfies OccupancyKind,
          checkIn: toUtcDate(input.checkIn),
          checkOut: toUtcDate(input.checkOut),
          blockReason: input.reason satisfies BlockReason,
          source: "MANUAL" satisfies Channel,
          note: input.note,
        },
      });
      await logAvailability(tx, ctx, { unitId: unit.id, occupancyId: occ.id, action: "created", after: { block: input.reason, checkIn: input.checkIn, checkOut: input.checkOut } });
      await audit(tx, ctx, "occupancy", occ.id, "block_created", { reason: input.reason });
      return occ;
    }),
  );
}

export async function releaseBlock(db: Db, ctx: TenantContext, occupancyId: string) {
  assertCan(ctx, "availability:block");
  return db.$transaction(async (tx) => {
    const occ = await tx.occupancy.findFirst({ where: { id: occupancyId, organizationId: ctx.organizationId, kind: "BLOCK" } });
    if (!occ) throw new NotFoundError("Bloqueio");
    const updated = await tx.occupancy.update({ where: { id: occ.id }, data: { isActive: false } });
    await logAvailability(tx, ctx, { unitId: occ.unitId, occupancyId: occ.id, action: "released" });
    await audit(tx, ctx, "occupancy", occ.id, "block_released");
    return updated;
  });
}
