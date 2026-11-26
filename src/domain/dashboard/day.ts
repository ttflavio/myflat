// Cálculos do painel do dia (funções puras). Tudo sai dos dados reais;
// sem reservas cadastradas, os números são zero e a tela diz isso.
import { addDays, diffDays, type IsoDate } from "../availability/dates";
import { coversNight } from "../availability/stay";

export type DayOccupancy = {
  id: string;
  unitId: string;
  kind: "RESERVATION" | "BLOCK" | "EXTERNAL";
  checkIn: IsoDate;
  checkOut: IsoDate;
  status: string | null; // status da reserva, quando é reserva
  guestName: string | null;
  channel: string | null;
  netAmount: number | null; // líquido previsto da reserva
  blockReason: string | null;
};

export type UnitState = "occupied" | "blocked" | "free";

/** Situação de cada flat na noite de `today`. */
export function unitStateTonight(unitId: string, occ: DayOccupancy[], today: IsoDate): UnitState {
  const tonight = occ.filter((o) => o.unitId === unitId && coversNight(o, today));
  if (tonight.some((o) => o.kind === "BLOCK")) return "blocked";
  if (tonight.length) return "occupied";
  return "free";
}

export function checkInsOn(occ: DayOccupancy[], day: IsoDate) {
  return occ.filter((o) => o.kind !== "BLOCK" && o.checkIn === day);
}

export function checkOutsOn(occ: DayOccupancy[], day: IsoDate) {
  return occ.filter((o) => o.kind !== "BLOCK" && o.checkOut === day);
}

/** Próximos check-ins depois de hoje, até `days` dias. */
export function upcomingCheckIns(occ: DayOccupancy[], today: IsoDate, days = 7) {
  const end = addDays(today, days);
  return occ
    .filter((o) => o.kind !== "BLOCK" && o.checkIn > today && o.checkIn <= end)
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
}

/** Primeiro e último dia (exclusivo) do mês de `today`. */
export function monthRange(today: IsoDate): { start: IsoDate; end: IsoDate; nights: number } {
  const start = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end: next, nights: diffDays(start, next) };
}

/**
 * Ocupação e receita líquida prevista do mês, rateando cada reserva pelas noites que caem no mês.
 * Bloqueios não contam como ocupação nem como noite disponível perdida (são indisponibilidade).
 */
export function monthFigures(occ: DayOccupancy[], unitCount: number, today: IsoDate) {
  const { start, end, nights } = monthRange(today);
  let occupiedNights = 0;
  let blockedNights = 0;
  let netForecast = 0;
  for (const o of occ) {
    const from = o.checkIn > start ? o.checkIn : start;
    const to = o.checkOut < end ? o.checkOut : end;
    const n = Math.max(0, diffDays(from, to));
    if (!n) continue;
    if (o.kind === "BLOCK") {
      blockedNights += n;
      continue;
    }
    occupiedNights += n;
    if (o.netAmount != null) netForecast += (o.netAmount * n) / diffDays(o.checkIn, o.checkOut);
  }
  const availableNights = unitCount * nights - blockedNights;
  return {
    occupiedNights,
    availableNights,
    occupancyRate: availableNights > 0 ? occupiedNights / availableNights : 0,
    netForecast: Math.round(netForecast * 100) / 100,
  };
}
