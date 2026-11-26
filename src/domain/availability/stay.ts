import { diffDays, isIsoDate, type IsoDate } from "./dates";

/** Intervalo de ocupação meio-aberto: [checkIn, checkOut). */
export type Stay = { checkIn: IsoDate; checkOut: IsoDate };

export const MAX_NIGHTS = 365;

export type StayError = "invalid_date" | "checkout_not_after_checkin" | "too_long";

export function validateStay(stay: Stay): StayError | null {
  if (!isIsoDate(stay.checkIn) || !isIsoDate(stay.checkOut)) return "invalid_date";
  const n = diffDays(stay.checkIn, stay.checkOut);
  if (n <= 0) return "checkout_not_after_checkin";
  if (n > MAX_NIGHTS) return "too_long";
  return null;
}

export function nights(stay: Stay): number {
  return diffDays(stay.checkIn, stay.checkOut);
}

/**
 * Duas estadias conflitam se dividem pelo menos uma noite.
 * Check-out e check-in no mesmo dia NÃO conflitam (dia de troca).
 * Mesma regra da constraint occupancies_no_overlap no PostgreSQL.
 */
export function overlaps(a: Stay, b: Stay): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

/** Noite ocupada: a estadia cobre a noite que começa em `date`. */
export function coversNight(stay: Stay, date: IsoDate): boolean {
  return stay.checkIn <= date && date < stay.checkOut;
}

export type OccupancyLike = Stay & { id: string; unitId: string; isActive: boolean };

export function findConflicts<T extends OccupancyLike>(
  candidate: Stay & { unitId: string; id?: string },
  existing: readonly T[],
): T[] {
  return existing.filter(
    (o) => o.isActive && o.unitId === candidate.unitId && o.id !== candidate.id && overlaps(o, candidate),
  );
}
