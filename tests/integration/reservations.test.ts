// Testes contra PostgreSQL real: a garantia anti-overbooking é do banco,
// então é ali que ela precisa ser provada.
import { afterAll, describe, expect, it } from "vitest";
import {
  changeReservationDates,
  changeReservationStatus,
  createBlock,
  createReservation,
  releaseBlock,
} from "@/server/reservations/service";
import { AvailabilityConflictError, ForbiddenError, InvalidTransitionError, NotFoundError, ValidationError } from "@/server/errors";
import { makeOrg, testDb } from "../setup/factory";

const db = testDb();
afterAll(() => db.$disconnect());

const base = { channel: "AIRBNB" as const, guestCount: 2, totalAmount: 1200, channelFee: 180 };

describe("reservas e disponibilidade", () => {
  it("cria reserva confirmada que ocupa a agenda, com histórico e auditoria", async () => {
    const { ctx, units } = await makeOrg(db);
    const r = await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05", guest: { name: "Ana" } });
    expect(r.code).toMatch(/^MF-/);
    expect(r.netAmount.toString()).toBe("1020");
    const occ = await db.occupancy.findUnique({ where: { reservationId: r.id } });
    expect(occ?.isActive).toBe(true);
    expect(await db.availabilityEvent.count({ where: { occupancyId: occ!.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: r.id } })).toBe(1);
  });

  it("impede sobreposição e explica com qual reserva conflita", async () => {
    const { ctx, units } = await makeOrg(db);
    const first = await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05" });
    const err = await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-04", checkOut: "2026-12-06" }).catch((e) => e);
    expect(err).toBeInstanceOf(AvailabilityConflictError);
    expect((err as AvailabilityConflictError).conflicts.map((c) => c.reservationCode)).toEqual([first.code]);
    expect(await db.reservation.count({ where: { organizationId: ctx.organizationId } })).toBe(1);
  });

  it("permite check-in no dia do check-out anterior", async () => {
    const { ctx, units } = await makeOrg(db);
    await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05" });
    await expect(createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-05", checkOut: "2026-12-07" })).resolves.toBeTruthy();
  });

  it("flats diferentes não interferem entre si", async () => {
    const { ctx, units } = await makeOrg(db, { units: 2 });
    await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05" });
    await expect(createReservation(db, ctx, { ...base, unitId: units[1].id, checkIn: "2026-12-01", checkOut: "2026-12-05" })).resolves.toBeTruthy();
  });

  it("bloqueio administrativo impede reserva; liberar o bloqueio libera a data", async () => {
    const { ctx, units } = await makeOrg(db);
    const block = await createBlock(db, ctx, { unitId: units[0].id, checkIn: "2026-12-10", checkOut: "2026-12-12", reason: "MAINTENANCE", note: "Chuveiro" });
    await expect(createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-11", checkOut: "2026-12-13" })).rejects.toBeInstanceOf(AvailabilityConflictError);
    await releaseBlock(db, ctx, block.id);
    await expect(createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-11", checkOut: "2026-12-13" })).resolves.toBeTruthy();
  });

  it("cancelar libera as datas na hora", async () => {
    const { ctx, units } = await makeOrg(db);
    const r = await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05" });
    await changeReservationStatus(db, ctx, r.id, "CANCELLED");
    await expect(createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-02", checkOut: "2026-12-04" })).resolves.toBeTruthy();
  });

  it("consulta não ocupa; confirmar depois esbarra em quem pegou a data antes", async () => {
    const { ctx, units } = await makeOrg(db);
    const inquiry = await createReservation(db, ctx, { ...base, status: "INQUIRY", unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05" });
    await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-03", checkOut: "2026-12-04" });
    await expect(changeReservationStatus(db, ctx, inquiry.id, "CONFIRMED")).rejects.toBeInstanceOf(AvailabilityConflictError);
    expect((await db.reservation.findUnique({ where: { id: inquiry.id } }))?.status).toBe("INQUIRY");
  });

  it("mudar datas para um período ocupado é recusado e nada muda", async () => {
    const { ctx, units } = await makeOrg(db);
    await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-05" });
    const r2 = await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-08", checkOut: "2026-12-10" });
    await expect(changeReservationDates(db, ctx, r2.id, { checkIn: "2026-12-04", checkOut: "2026-12-09" })).rejects.toBeInstanceOf(AvailabilityConflictError);
    const after = await db.occupancy.findUnique({ where: { reservationId: r2.id } });
    expect(after?.checkIn.toISOString().slice(0, 10)).toBe("2026-12-08");
    await expect(changeReservationDates(db, ctx, r2.id, { checkIn: "2026-12-05", checkOut: "2026-12-09" })).resolves.toBeTruthy();
  });

  it("pré-reserva vencida deixa de ocupar e é cancelada", async () => {
    const { ctx, units } = await makeOrg(db);
    const t0 = new Date("2026-11-24T12:00:00Z");
    const hold = await createReservation(db, ctx, { ...base, status: "HOLD", holdHours: 24, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-04" }, t0);
    await expect(
      createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-02", checkOut: "2026-12-03" }, new Date("2026-11-25T11:00:00Z")),
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
    await expect(
      createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-02", checkOut: "2026-12-03" }, new Date("2026-11-25T12:30:00Z")),
    ).resolves.toBeTruthy();
    expect((await db.reservation.findUnique({ where: { id: hold.id } }))?.status).toBe("CANCELLED");
  });

  it("20 pedidos simultâneos para as mesmas datas: exatamente 1 vence", async () => {
    const { ctx, units } = await makeOrg(db);
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-20", checkOut: "2026-12-23", notes: `tentativa ${i}` }),
      ),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const conflicts = attempts.filter((a) => a.status === "rejected" && a.reason instanceof AvailabilityConflictError);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    expect(await db.occupancy.count({ where: { unitId: units[0].id, isActive: true } })).toBe(1);
  });

  it("valida datas, capacidade e transições", async () => {
    const { ctx, units } = await makeOrg(db);
    await expect(createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-05", checkOut: "2026-12-05" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createReservation(db, ctx, { ...base, guestCount: 9, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-02" })).rejects.toBeInstanceOf(ValidationError);
    const r = await createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-02" });
    await changeReservationStatus(db, ctx, r.id, "CANCELLED");
    await expect(changeReservationStatus(db, ctx, r.id, "CONFIRMED")).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe("isolamento entre organizações e permissões", () => {
  it("uma organização não reserva, lê nem cancela o flat de outra", async () => {
    const a = await makeOrg(db);
    const b = await makeOrg(db);
    await expect(createReservation(db, b.ctx, { ...base, unitId: a.units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-02" })).rejects.toBeInstanceOf(NotFoundError);
    const r = await createReservation(db, a.ctx, { ...base, unitId: a.units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-02" });
    await expect(changeReservationStatus(db, b.ctx, r.id, "CANCELLED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(createBlock(db, b.ctx, { unitId: a.units[0].id, checkIn: "2026-12-05", checkOut: "2026-12-06", reason: "OTHER" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("papel sem permissão é barrado no servidor", async () => {
    const { ctx, units } = await makeOrg(db, { role: "CLEANING" });
    await expect(createReservation(db, ctx, { ...base, unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-02" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createBlock(db, ctx, { unitId: units[0].id, checkIn: "2026-12-01", checkOut: "2026-12-02", reason: "OTHER" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
