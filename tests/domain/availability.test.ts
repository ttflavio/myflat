import { describe, expect, it } from "vitest";
import { addDays, diffDays, isIsoDate, todayIn } from "@/domain/availability/dates";
import { coversNight, findConflicts, nights, overlaps, validateStay } from "@/domain/availability/stay";
import { canTransition, occupiesCalendar } from "@/domain/reservations/status";
import { commissionCents } from "@/domain/finance/commission";

describe("datas", () => {
  it("valida datas reais", () => {
    expect(isIsoDate("2026-11-24")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("24/11/2026")).toBe(false);
  });
  it("soma e subtrai dias atravessando meses e anos", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2026-11-24", "2026-12-01")).toBe(7);
  });
  it("calcula hoje no fuso de João Pessoa", () => {
    // 02:30 UTC de 25/11 ainda é 24/11 em João Pessoa (UTC-3)
    expect(todayIn("America/Fortaleza", new Date("2026-11-25T02:30:00Z"))).toBe("2026-11-24");
  });
});

describe("estadias", () => {
  const a = { checkIn: "2026-11-24", checkOut: "2026-11-28" };
  it("conta noites", () => expect(nights(a)).toBe(4));
  it("check-out e check-in no mesmo dia não conflitam", () => {
    expect(overlaps(a, { checkIn: "2026-11-28", checkOut: "2026-11-30" })).toBe(false);
    expect(overlaps({ checkIn: "2026-11-20", checkOut: "2026-11-24" }, a)).toBe(false);
  });
  it("uma noite em comum é conflito", () => {
    expect(overlaps(a, { checkIn: "2026-11-27", checkOut: "2026-11-29" })).toBe(true);
    expect(overlaps(a, { checkIn: "2026-11-25", checkOut: "2026-11-26" })).toBe(true);
    expect(overlaps(a, { checkIn: "2026-11-01", checkOut: "2026-12-31" })).toBe(true);
  });
  it("cobre a noite do check-in, não a do check-out", () => {
    expect(coversNight(a, "2026-11-24")).toBe(true);
    expect(coversNight(a, "2026-11-28")).toBe(false);
  });
  it("rejeita estadias inválidas", () => {
    expect(validateStay({ checkIn: "2026-11-24", checkOut: "2026-11-24" })).toBe("checkout_not_after_checkin");
    expect(validateStay({ checkIn: "2026-11-24", checkOut: "2026-11-20" })).toBe("checkout_not_after_checkin");
    expect(validateStay({ checkIn: "2026-11-24", checkOut: "2028-01-01" })).toBe("too_long");
    expect(validateStay(a)).toBeNull();
  });
  it("encontra conflitos só na mesma unidade e entre ocupações ativas", () => {
    const existing = [
      { id: "1", unitId: "u1", isActive: true, checkIn: "2026-11-26", checkOut: "2026-11-29" },
      { id: "2", unitId: "u2", isActive: true, checkIn: "2026-11-26", checkOut: "2026-11-29" },
      { id: "3", unitId: "u1", isActive: false, checkIn: "2026-11-25", checkOut: "2026-11-27" },
    ];
    expect(findConflicts({ ...a, unitId: "u1" }, existing).map((o) => o.id)).toEqual(["1"]);
  });
});

describe("status da reserva", () => {
  it("segue as transições permitidas", () => {
    expect(canTransition("HOLD", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("INQUIRY", "CHECKED_IN")).toBe(false);
  });
  it("só ocupa a agenda quem deve", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    expect(occupiesCalendar("INQUIRY", null, now)).toBe(false);
    expect(occupiesCalendar("CONFIRMED", null, now)).toBe(true);
    expect(occupiesCalendar("CANCELLED", null, now)).toBe(false);
    expect(occupiesCalendar("HOLD", new Date("2026-11-25T12:00:00Z"), now)).toBe(true);
    expect(occupiesCalendar("HOLD", new Date("2026-11-24T11:00:00Z"), now)).toBe(false);
  });
});

describe("comissão (regras do cadastro da cliente)", () => {
  it("plataforma: sobre o líquido", () => {
    expect(commissionCents({ channel: "AIRBNB", totalCents: 100_000, channelFeeCents: 15_000, rate: 0.15 })).toBe(12_750);
  });
  it("reserva direta: sobre o total", () => {
    expect(commissionCents({ channel: "DIRECT", totalCents: 100_000, channelFeeCents: 0, rate: 0.2 })).toBe(20_000);
    expect(commissionCents({ channel: "WHATSAPP", totalCents: 100_000, channelFeeCents: 0, rate: 0.15 })).toBe(15_000);
  });
  it("imóvel próprio: sem comissão", () => {
    expect(commissionCents({ channel: "AIRBNB", totalCents: 100_000, channelFeeCents: 15_000, rate: null })).toBe(0);
  });
});
