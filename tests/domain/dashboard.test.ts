import { describe, expect, it } from "vitest";
import { checkInsOn, checkOutsOn, monthFigures, monthRange, unitStateTonight, upcomingCheckIns, type DayOccupancy } from "@/domain/dashboard/day";

const o = (over: Partial<DayOccupancy>): DayOccupancy => ({
  id: Math.random().toString(36),
  unitId: "u1",
  kind: "RESERVATION",
  checkIn: "2026-11-24",
  checkOut: "2026-11-28",
  status: "CONFIRMED",
  guestName: null,
  channel: "AIRBNB",
  netAmount: 400,
  blockReason: null,
  ...over,
});

describe("painel do dia", () => {
  const today = "2026-11-26";

  it("flat ocupado, bloqueado ou livre na noite de hoje", () => {
    const occ = [o({}), o({ unitId: "u2", kind: "BLOCK", netAmount: null }), o({ unitId: "u3", checkOut: "2026-11-26" })];
    expect(unitStateTonight("u1", occ, today)).toBe("occupied");
    expect(unitStateTonight("u2", occ, today)).toBe("blocked");
    expect(unitStateTonight("u3", occ, today)).toBe("free"); // saiu hoje de manhã
    expect(unitStateTonight("u4", occ, today)).toBe("free");
  });

  it("check-ins, check-outs e próximos 7 dias (bloqueio não conta)", () => {
    const occ = [
      o({ checkIn: today, checkOut: "2026-11-29" }),
      o({ checkIn: "2026-11-20", checkOut: today }),
      o({ kind: "BLOCK", checkIn: today, checkOut: "2026-11-27" }),
      o({ checkIn: "2026-11-30", checkOut: "2026-12-02" }),
      o({ checkIn: "2026-12-10", checkOut: "2026-12-12" }),
    ];
    expect(checkInsOn(occ, today)).toHaveLength(1);
    expect(checkOutsOn(occ, today)).toHaveLength(1);
    expect(upcomingCheckIns(occ, today, 7).map((x) => x.checkIn)).toEqual(["2026-11-30"]);
  });

  it("mês: noites ocupadas, disponíveis e receita líquida rateada", () => {
    expect(monthRange(today)).toEqual({ start: "2026-11-01", end: "2026-12-01", nights: 30 });
    expect(monthRange("2026-12-05").end).toBe("2027-01-01");
    // 4 noites a R$ 400 líquidos, 2 delas em novembro e 2 em dezembro → R$ 200 em novembro
    const occ = [o({ checkIn: "2026-11-29", checkOut: "2026-12-03" }), o({ unitId: "u2", kind: "BLOCK", checkIn: "2026-11-01", checkOut: "2026-11-11", netAmount: null })];
    const f = monthFigures(occ, 2, today);
    expect(f.occupiedNights).toBe(2);
    expect(f.availableNights).toBe(2 * 30 - 10);
    expect(f.netForecast).toBe(200);
    expect(f.occupancyRate).toBeCloseTo(2 / 50);
  });

  it("sem reservas, tudo zero (nada inventado)", () => {
    const f = monthFigures([], 6, today);
    expect(f).toEqual({ occupiedNights: 0, availableNights: 180, occupancyRate: 0, netForecast: 0 });
  });
});
