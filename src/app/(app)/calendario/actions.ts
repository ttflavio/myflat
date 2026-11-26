"use server";
// Ações do calendário. Cada uma pega a sessão no servidor, chama o serviço de domínio
// (que valida permissões e a organização) e devolve um resultado simples para a tela.
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/server/db";
import { AppError, AvailabilityConflictError, ValidationError } from "@/server/errors";
import { getSession } from "@/server/session";
import { changeReservationStatus, createBlock, createReservation, releaseBlock } from "@/server/reservations/service";

export type ActionResult = { ok: boolean; message: string; conflicts?: string[] };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function toResult(err: unknown): ActionResult {
  unstable_rethrow(err); // deixa passar o redirect para /login
  if (err instanceof AvailabilityConflictError) {
    return {
      ok: false,
      message: "Essas datas já estão ocupadas. Nada foi salvo.",
      conflicts: err.conflicts.map((c) => `${c.reservationCode ?? (c.kind === "BLOCK" ? "Bloqueio" : "Ocupação")}${c.note ? ` (${c.note})` : ""}: ${br(c.checkIn)} a ${br(c.checkOut)}`),
    };
  }
  if (err instanceof ValidationError) {
    const issues = Array.isArray(err.issues) ? (err.issues as { path?: unknown[]; message?: string }[]) : [];
    const detail = issues.map((i) => `${(i.path ?? []).join(".")}: ${i.message}`).join("; ");
    return { ok: false, message: detail ? `${err.message} ${detail}` : err.message };
  }
  if (err instanceof AppError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Erro inesperado. Tente de novo." };
}

export async function createReservationAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const session = await getSession();
    const guestName = str(form, "guestName");
    const r = await createReservation(getDb(), session, {
      unitId: str(form, "unitId") ?? "",
      channel: (str(form, "channel") ?? "MANUAL") as never,
      status: (str(form, "status") ?? "CONFIRMED") as never,
      checkIn: str(form, "checkIn") ?? "",
      checkOut: str(form, "checkOut") ?? "",
      guestCount: num(form, "guestCount") ?? 1,
      totalAmount: num(form, "totalAmount") ?? 0,
      channelFee: num(form, "channelFee") ?? 0,
      guest: guestName ? { name: guestName, phone: str(form, "guestPhone") } : undefined,
      notes: str(form, "notes"),
    });
    refresh();
    return { ok: true, message: `Reserva ${r.code} salva.` };
  } catch (err) {
    return toResult(err);
  }
}

export async function createBlockAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const session = await getSession();
    await createBlock(getDb(), session, {
      unitId: str(form, "unitId") ?? "",
      checkIn: str(form, "checkIn") ?? "",
      checkOut: str(form, "checkOut") ?? "",
      reason: (str(form, "reason") ?? "OTHER") as never,
      note: str(form, "note"),
    });
    refresh();
    return { ok: true, message: "Datas bloqueadas." };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelReservationAction(reservationId: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    const r = await changeReservationStatus(getDb(), session, reservationId, "CANCELLED");
    refresh();
    return { ok: true, message: `Reserva ${r.code} cancelada. As datas foram liberadas.` };
  } catch (err) {
    return toResult(err);
  }
}

export async function releaseBlockAction(occupancyId: string): Promise<ActionResult> {
  try {
    const session = await getSession();
    await releaseBlock(getDb(), session, occupancyId);
    refresh();
    return { ok: true, message: "Bloqueio liberado." };
  } catch (err) {
    return toResult(err);
  }
}
