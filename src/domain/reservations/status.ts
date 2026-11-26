// Status de reserva e transições permitidas. Fonte única da regra: a UI,
// a API e a IA passam por aqui antes de mudar uma reserva.

export const RESERVATION_STATUSES = [
  "INQUIRY",
  "AWAITING_CONFIRM",
  "HOLD",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_STAY",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  INQUIRY: "Consulta",
  AWAITING_CONFIRM: "Aguardando confirmação",
  HOLD: "Pré-reserva",
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Check-in realizado",
  IN_STAY: "Hospedagem em andamento",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No-show",
};

const TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  INQUIRY: ["AWAITING_CONFIRM", "HOLD", "CONFIRMED", "CANCELLED"],
  AWAITING_CONFIRM: ["HOLD", "CONFIRMED", "CANCELLED"],
  HOLD: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_STAY", "COMPLETED"],
  IN_STAY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ReservationStatus): readonly ReservationStatus[] {
  return TRANSITIONS[from];
}

/**
 * A reserva ocupa a agenda? Consulta e "aguardando confirmação" são intenção e não ocupam.
 * Pré-reserva ocupa até vencer. Finalizada continua ocupando (a noite já aconteceu).
 */
export function occupiesCalendar(
  status: ReservationStatus,
  holdExpiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  switch (status) {
    case "HOLD":
      return !!holdExpiresAt && holdExpiresAt.getTime() > now.getTime();
    case "CONFIRMED":
    case "CHECKED_IN":
    case "IN_STAY":
    case "COMPLETED":
      return true;
    default:
      return false;
  }
}
