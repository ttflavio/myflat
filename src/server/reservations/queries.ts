// Lista de reservas com filtros. Leitura apenas; mudanças passam por service.ts.
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { fromUtcDate, toUtcDate, type IsoDate } from "@/domain/availability/dates";
import { RESERVATION_STATUSES } from "@/domain/reservations/status";
import type { Db } from "../db";
import { assertCan, type TenantContext } from "../tenant";

export const reservationFilters = z.object({
  period: z.enum(["upcoming", "current", "past", "all"]).default("upcoming"),
  status: z.enum(RESERVATION_STATUSES).optional(),
  channel: z.enum(["AIRBNB", "BOOKING", "DECOLAR", "WHATSAPP", "DIRECT", "MANUAL", "OTHER"]).optional(),
  unitId: z.string().uuid().optional(),
  q: z.string().trim().max(80).optional(),
});
export type ReservationFilters = z.input<typeof reservationFilters>;

export type ReservationRow = {
  id: string;
  code: string;
  unitId: string;
  unitCode: string;
  building: string;
  guestName: string | null;
  guestPhone: string | null;
  channel: string;
  status: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guestCount: number;
  totalAmount: string;
  channelFee: string;
  netAmount: string;
  holdExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
};

const CLOSED = ["CANCELLED", "NO_SHOW"] as const;

/** Monta o filtro do banco. "Próximas" = ainda não começaram; "Em andamento" = cobre hoje. */
export function buildWhere(organizationId: string, f: z.output<typeof reservationFilters>, today: IsoDate): Prisma.ReservationWhereInput {
  const t = toUtcDate(today);
  const where: Prisma.ReservationWhereInput = { organizationId };
  if (f.period === "upcoming") Object.assign(where, { checkIn: { gt: t }, status: { notIn: [...CLOSED] } });
  if (f.period === "current") Object.assign(where, { checkIn: { lte: t }, checkOut: { gt: t }, status: { notIn: [...CLOSED] } });
  if (f.period === "past") Object.assign(where, { checkOut: { lte: t } });
  if (f.status) where.status = f.status;
  if (f.channel) where.channel = f.channel;
  if (f.unitId) where.unitId = f.unitId;
  if (f.q) {
    where.OR = [
      { code: { contains: f.q, mode: "insensitive" } },
      { guest: { name: { contains: f.q, mode: "insensitive" } } },
      { guest: { phone: { contains: f.q } } },
    ];
  }
  return where;
}

export async function listReservations(db: Db, ctx: TenantContext, raw: ReservationFilters, today: IsoDate): Promise<ReservationRow[]> {
  assertCan(ctx, "reservation:read");
  const f = reservationFilters.parse(raw);
  const rows = await db.reservation.findMany({
    where: buildWhere(ctx.organizationId, f, today),
    include: { guest: true, unit: { include: { property: { select: { name: true } } } } },
    orderBy: { checkIn: f.period === "past" ? "desc" : "asc" },
    take: 300,
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    unitId: r.unitId,
    unitCode: r.unit.code,
    building: r.unit.property.name,
    guestName: r.guest?.name ?? null,
    guestPhone: r.guest?.phone ?? null,
    channel: r.channel,
    status: r.status,
    checkIn: fromUtcDate(r.checkIn),
    checkOut: fromUtcDate(r.checkOut),
    guestCount: r.guestCount,
    totalAmount: r.totalAmount.toFixed(2),
    channelFee: r.channelFee.toFixed(2),
    netAmount: r.netAmount.toFixed(2),
    holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Converte os parâmetros da URL em filtros válidos (valores inválidos são ignorados). */
export function filtersFromSearch(sp: Record<string, string | string[] | undefined>): ReservationFilters {
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const parsed = reservationFilters.safeParse({
    period: one("periodo") ?? "upcoming",
    status: one("status"),
    channel: one("canal"),
    unitId: one("flat"),
    q: one("q"),
  });
  return parsed.success ? parsed.data : { period: "upcoming" };
}
