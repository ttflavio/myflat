"use client";

import { useActionState, useState, useTransition } from "react";
import { diffDays, type IsoDate } from "@/domain/availability/dates";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type TaskCategoryName,
  type TaskPriorityName,
  type TaskStatusName,
} from "@/domain/tasks/labels";
import type { TaskView } from "@/server/tasks/service";
import { assignUnitAction, captureAction, createManualAction, setStatusAction, type PendResult } from "./actions";

type Unit = { id: string; code: string; building: string };

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const PRIORITY_STYLE: Record<string, string> = {
  URGENT: "border-warn bg-warn-bg text-warn-ink",
  HIGH: "border-warn text-warn-ink",
  MEDIUM: "",
  LOW: "opacity-75",
};

function Notice({ r, units }: { r: PendResult; units: Unit[] }) {
  if (!r) return null;
  const code = (id: string | null) => (id ? `Flat ${units.find((u) => u.id === id)?.code ?? "?"}` : "Triagem");
  return (
    <div role="status" className={`mt-3 rounded-[10px] border p-3 text-sm ${r.ok ? "border-ok" : "border-warn bg-warn-bg text-warn-ink"}`}>
      <b>{r.message}</b>
      {r.created && (
        <ul className="mt-1 list-disc pl-5">
          {r.created.map((c, i) => (
            <li key={i}>
              {code(c.unitId)} · {c.title}
              {c.status === "INBOX" && " (revisar)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DueChip({ due, today }: { due: string | null; today: IsoDate }) {
  if (!due) return null;
  const d = diffDays(today, due);
  const label = d < 0 ? `Atrasada (${dm(due)})` : d === 0 ? "Hoje" : d === 1 ? "Amanhã" : `Até ${dm(due)}`;
  return <span className={`chip ${d <= 0 ? "border-warn text-warn-ink" : ""}`}>{label}</span>;
}

function TaskRow({ t, today, canWrite, onRun }: { t: TaskView; today: IsoDate; canWrite: boolean; onRun: (fn: () => Promise<PendResult>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-line py-2.5 first:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <b className="text-sm">{t.title}</b>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={`chip ${PRIORITY_STYLE[t.priority] ?? ""}`}>{PRIORITY_LABEL[t.priority as TaskPriorityName]}</span>
            <span className="chip">{CATEGORY_LABEL[t.category as TaskCategoryName] ?? t.category}</span>
            <DueChip due={t.dueDate} today={today} />
            {t.status !== "TODO" && <span className="chip">{STATUS_LABEL[t.status]}</span>}
            {t.source === "AI" && <span className="chip">IA</span>}
          </div>
        </button>
        {canWrite && (
          <button className="btn min-h-9 shrink-0 px-3 text-[13px]" onClick={() => onRun(() => setStatusAction(t.id, "DONE"))}>
            Concluir
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 rounded-lg bg-soft p-2.5 text-[13px]">
          {t.description && <p>{t.description}</p>}
          {t.dueReason && <p className="text-mute">Prazo: {t.dueReason}</p>}
          {t.reviewReason && <p className="text-warn-ink">Revisar: {t.reviewReason}</p>}
          {t.sourceText && <p className="mt-1 text-mute">Texto original: “{t.sourceText}”</p>}
          {canWrite && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-mute" htmlFor={`st-${t.id}`}>Status</label>
              <select
                id={`st-${t.id}`}
                className="field w-auto py-1.5 text-sm"
                value={t.status}
                onChange={(e) => onRun(() => setStatusAction(t.id, e.target.value as TaskStatusName))}
              >
                {(["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"] as const).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
                {t.status === "INBOX" && <option value="INBOX">{STATUS_LABEL.INBOX}</option>}
              </select>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function PendenciasBoard({
  tasks,
  units,
  today,
  aiReady,
  canWrite,
}: {
  tasks: TaskView[];
  units: Unit[];
  today: IsoDate;
  aiReady: boolean;
  canWrite: boolean;
}) {
  const [capState, capAction, capturing] = useActionState(captureAction, null);
  const [manState, manAction, adding] = useActionState(createManualAction, null);
  const [rowResult, setRowResult] = useState<PendResult>(null);
  const [pending, start] = useTransition();
  const [showManual, setShowManual] = useState(false);
  const run = (fn: () => Promise<PendResult>) => start(async () => setRowResult(await fn()));

  const triage = tasks.filter((t) => !t.unitId);
  const byUnit = units.map((u) => ({ unit: u, items: tasks.filter((t) => t.unitId === u.id) }));
  const label = "mb-1 mt-3 block text-[13px] text-mute";

  return (
    <div className="grid gap-5">
      {canWrite && (
        <section className="rounded-[14px] border border-line p-4">
          {!aiReady && <h2 className="font-display text-lg font-bold">Nova pendência</h2>}
          {aiReady && (
          <form action={capAction}>
            <label className="mb-1 block font-display text-lg font-bold" htmlFor="text">O que precisa ser feito?</label>
            <textarea
              id="text"
              name="text"
              className="field min-h-28"
              maxLength={3000}
              defaultValue={capState && !capState.ok ? capState.keepText : ""}
              key={capState?.keepText ?? (capState ? "ok" : "novo")}
              placeholder={"Ex.: Flat 204 precisa trocar a resistência do chuveiro antes do próximo check-in. Comprar duas toalhas para o 319."}
              disabled={!aiReady}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" disabled={!aiReady || capturing}>{capturing ? "Organizando…" : "Organizar com IA"}</button>
              <button type="button" className="btn" onClick={() => setShowManual((s) => !s)} aria-expanded={showManual}>
                Adicionar manualmente
              </button>
            </div>
          </form>
          )}
          {aiReady && <Notice r={capState} units={units} />}

          {(showManual || !aiReady) && (
            <form action={manAction} className={aiReady ? "mt-4 border-t border-line pt-3" : ""}>
              <div className="grid gap-x-3 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="m-unit">Flat</label>
                  <select className="field" id="m-unit" name="unitId" defaultValue="">
                    <option value="">Sem flat (triagem)</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>Flat {u.code} · {u.building}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="m-title">Pendência</label>
                  <input className="field" id="m-title" name="title" required minLength={2} />
                </div>
                <div>
                  <label className={label} htmlFor="m-cat">Categoria</label>
                  <select className="field" id="m-cat" name="category" defaultValue="MAINTENANCE">
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label} htmlFor="m-pri">Prioridade</label>
                    <select className="field" id="m-pri" name="priority" defaultValue="MEDIUM">
                      {TASK_PRIORITIES.map((p) => (
                        <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="m-due">Prazo</label>
                    <input className="field" id="m-due" name="dueDate" type="date" />
                  </div>
                </div>
              </div>
              <label className={label} htmlFor="m-desc">Detalhes</label>
              <input className="field" id="m-desc" name="description" />
              <button className="btn btn-primary mt-3" disabled={adding}>{adding ? "Salvando…" : "Salvar pendência"}</button>
              <Notice r={manState} units={units} />
            </form>
          )}
        </section>
      )}

      {rowResult && !rowResult.ok && <Notice r={rowResult} units={units} />}

      {triage.length > 0 && (
        <section className="rounded-[14px] border border-warn p-4">
          <h2 className="text-lg font-bold">Triagem · {triage.length}</h2>
          <p className="text-sm text-mute">A IA não teve certeza do flat. Escolha o flat para mover a pendência.</p>
          <ul className="mt-2">
            {triage.map((t) => (
              <li key={t.id} className="border-t border-line py-2.5 first:border-t-0">
                <b className="text-sm">{t.title}</b>
                {t.reviewReason && <p className="text-[13px] text-warn-ink">{t.reviewReason}</p>}
                {t.sourceText && <p className="text-[13px] text-mute">“{t.sourceText}”</p>}
                {canWrite && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="sr-only" htmlFor={`as-${t.id}`}>Flat para “{t.title}”</label>
                    <select
                      id={`as-${t.id}`}
                      className="field w-auto py-1.5 text-sm"
                      defaultValue=""
                      disabled={pending}
                      onChange={(e) => e.target.value && run(() => assignUnitAction(t.id, e.target.value))}
                    >
                      <option value="" disabled>Escolher flat…</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>Flat {u.code}</option>
                      ))}
                    </select>
                    <button className="btn min-h-9 px-3 text-[13px]" disabled={pending} onClick={() => run(() => setStatusAction(t.id, "CANCELLED"))}>
                      Descartar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {byUnit.map(({ unit, items }) => (
          <div key={unit.id} className="rounded-[14px] border border-line p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">Flat {unit.code}</h2>
              <span className="text-sm text-mute">{unit.building}</span>
            </div>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-mute">Nenhuma pendência.</p>
            ) : (
              <ul className="mt-2">
                {items.map((t) => (
                  <TaskRow key={t.id} t={t} today={today} canWrite={canWrite} onRun={run} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
