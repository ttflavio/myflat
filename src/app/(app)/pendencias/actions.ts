"use server";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { TaskStatusName } from "@/domain/tasks/labels";
import { captureTasks } from "@/server/ai/capture";
import { getDb } from "@/server/db";
import { AppError, ValidationError } from "@/server/errors";
import { getSession } from "@/server/session";
import { assignTaskUnit, createTasks, updateTaskStatus } from "@/server/tasks/service";

export type PendResult = { ok: boolean; message: string; created?: { title: string; unitId: string | null; status: string }[]; keepText?: string } | null;

function fail(err: unknown, keepText?: string): PendResult {
  unstable_rethrow(err);
  if (err instanceof ValidationError) {
    const issues = Array.isArray(err.issues) ? (err.issues as { message?: string }[]).map((i) => i.message).join("; ") : "";
    return { ok: false, message: issues ? `${err.message} ${issues}` : err.message, keepText };
  }
  if (err instanceof AppError) return { ok: false, message: err.message, keepText };
  console.error(err);
  return { ok: false, message: "Erro inesperado. Tente de novo.", keepText };
}

export async function captureAction(_prev: PendResult, form: FormData): Promise<PendResult> {
  const text = String(form.get("text") ?? "");
  try {
    const created = await captureTasks(getDb(), await getSession(), text);
    refresh();
    if (!created.length) return { ok: true, message: "A IA não encontrou nenhuma pendência nesse texto.", keepText: text };
    const triage = created.filter((t) => t.status === "INBOX").length;
    return {
      ok: true,
      message: `${created.length} pendência${created.length > 1 ? "s" : ""} organizada${created.length > 1 ? "s" : ""}${triage ? `; ${triage} precisa${triage > 1 ? "m" : ""} de revisão na triagem` : ""}.`,
      created: created.map((t) => ({ title: t.title, unitId: t.unitId, status: t.status })),
    };
  } catch (err) {
    return fail(err, text);
  }
}

export async function createManualAction(_prev: PendResult, form: FormData): Promise<PendResult> {
  try {
    const unitId = String(form.get("unitId") ?? "");
    const due = String(form.get("dueDate") ?? "");
    await createTasks(
      getDb(),
      await getSession(),
      [
        {
          unitId: unitId || null,
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? "") || null,
          category: String(form.get("category") ?? "OTHER") as never,
          priority: String(form.get("priority") ?? "MEDIUM") as never,
          dueDate: due || null,
        },
      ],
      { source: "MANUAL" },
    );
    refresh();
    return { ok: true, message: "Pendência adicionada." };
  } catch (err) {
    return fail(err);
  }
}

export async function setStatusAction(id: string, status: TaskStatusName): Promise<PendResult> {
  try {
    await updateTaskStatus(getDb(), await getSession(), id, status);
    refresh();
    return { ok: true, message: "Atualizado." };
  } catch (err) {
    return fail(err);
  }
}

export async function assignUnitAction(id: string, unitId: string): Promise<PendResult> {
  try {
    await assignTaskUnit(getDb(), await getSession(), id, unitId);
    refresh();
    return { ok: true, message: "Pendência movida para o flat." };
  } catch (err) {
    return fail(err);
  }
}
