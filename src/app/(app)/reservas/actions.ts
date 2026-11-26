"use server";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { ReservationStatus } from "@/domain/reservations/status";
import { getDb } from "@/server/db";
import { AppError, AvailabilityConflictError } from "@/server/errors";
import { getSession } from "@/server/session";
import { changeReservationDates, changeReservationStatus } from "@/server/reservations/service";

export type ResResult = { ok: boolean; message: string } | null;

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function fail(err: unknown): ResResult {
  unstable_rethrow(err);
  if (err instanceof AvailabilityConflictError) {
    return {
      ok: false,
      message: `Datas ocupadas: ${err.conflicts.map((c) => `${c.reservationCode ?? c.note ?? "bloqueio"} (${br(c.checkIn)} a ${br(c.checkOut)})`).join(", ")}. Nada foi alterado.`,
    };
  }
  if (err instanceof AppError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Erro inesperado. Tente de novo." };
}

const STATUS_DONE: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: "Reserva confirmada.",
  CHECKED_IN: "Check-in registrado.",
  IN_STAY: "Hospedagem em andamento.",
  COMPLETED: "Reserva finalizada.",
  CANCELLED: "Reserva cancelada. As datas foram liberadas.",
  NO_SHOW: "Marcada como no-show. As datas foram liberadas.",
};

export async function changeStatusAction(id: string, status: ReservationStatus): Promise<ResResult> {
  try {
    await changeReservationStatus(getDb(), await getSession(), id, status);
    refresh();
    return { ok: true, message: STATUS_DONE[status] ?? "Status atualizado." };
  } catch (err) {
    return fail(err);
  }
}

export async function changeDatesAction(id: string, checkIn: string, checkOut: string): Promise<ResResult> {
  try {
    await changeReservationDates(getDb(), await getSession(), id, { checkIn, checkOut });
    refresh();
    return { ok: true, message: `Datas alteradas para ${br(checkIn)} a ${br(checkOut)}.` };
  } catch (err) {
    return fail(err);
  }
}
