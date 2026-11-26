import { afterAll, describe, expect, it } from "vitest";
import { filtersFromSearch, listReservations } from "@/server/reservations/queries";
import { changeReservationStatus, createReservation } from "@/server/reservations/service";
import { makeOrg, testDb } from "../setup/factory";

const db = testDb();
afterAll(() => db.$disconnect());

const TODAY = "2026-12-10";

describe("lista de reservas", () => {
  it("separa próximas, em andamento e passadas; filtra por canal, flat e busca", async () => {
    const { ctx, units } = await makeOrg(db, { units: 2 });
    const [u0, u1] = units;
    const past = await createReservation(db, ctx, { unitId: u0.id, channel: "AIRBNB", checkIn: "2026-12-01", checkOut: "2026-12-04", guest: { name: "Ana Passada" } });
    const now = await createReservation(db, ctx, { unitId: u0.id, channel: "BOOKING", checkIn: "2026-12-08", checkOut: "2026-12-12", guest: { name: "Bruno Atual", phone: "83 98888-0000" } });
    const next = await createReservation(db, ctx, { unitId: u1.id, channel: "DIRECT", checkIn: "2026-12-20", checkOut: "2026-12-22", guest: { name: "Carla Futura" } });
    const cancelled = await createReservation(db, ctx, { unitId: u1.id, channel: "DIRECT", checkIn: "2026-12-24", checkOut: "2026-12-26" });
    await changeReservationStatus(db, ctx, cancelled.id, "CANCELLED");

    const codes = async (f: Parameters<typeof listReservations>[2]) => (await listReservations(db, ctx, f, TODAY)).map((r) => r.code);
    expect(await codes({ period: "upcoming" })).toEqual([next.code]);
    expect(await codes({ period: "current" })).toEqual([now.code]);
    expect(await codes({ period: "past" })).toEqual([past.code]);
    expect((await codes({ period: "all" })).length).toBe(4);
    expect(await codes({ period: "all", channel: "BOOKING" })).toEqual([now.code]);
    expect(await codes({ period: "all", unitId: u1.id, status: "CANCELLED" })).toEqual([cancelled.code]);
    expect(await codes({ period: "all", q: "carla" })).toEqual([next.code]);
    expect(await codes({ period: "all", q: "98888" })).toEqual([now.code]);
    expect(await codes({ period: "all", q: next.code.toLowerCase() })).toEqual([next.code]);
  });

  it("não mostra reservas de outra organização", async () => {
    const a = await makeOrg(db);
    const b = await makeOrg(db);
    await createReservation(db, a.ctx, { unitId: a.units[0].id, channel: "AIRBNB", checkIn: "2026-12-20", checkOut: "2026-12-22" });
    expect(await listReservations(db, b.ctx, { period: "all" }, TODAY)).toHaveLength(0);
  });

  it("parâmetros inválidos da URL são ignorados", () => {
    expect(filtersFromSearch({ periodo: "qualquer" })).toEqual({ period: "upcoming" });
    expect(filtersFromSearch({ periodo: "past", canal: "AIRBNB", q: "ana" })).toMatchObject({ period: "past", channel: "AIRBNB", q: "ana" });
  });
});
