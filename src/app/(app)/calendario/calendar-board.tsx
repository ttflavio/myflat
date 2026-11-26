"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { addDays, diffDays, type IsoDate } from "@/domain/availability/dates";
import { STATUS_LABEL, type ReservationStatus } from "@/domain/reservations/status";
import type { CalendarData, CalendarItem } from "@/server/calendar/queries";
import {
  cancelReservationAction,
  createBlockAction,
  createReservationAction,
  releaseBlockAction,
  type ActionResult,
} from "./actions";

const CHANNELS: Record<string, { label: string; color: string }> = {
  AIRBNB: { label: "Airbnb", color: "var(--ch-airbnb)" },
  BOOKING: { label: "Booking.com", color: "var(--ch-booking)" },
  DECOLAR: { label: "Decolar", color: "var(--ch-decolar)" },
  WHATSAPP: { label: "WhatsApp", color: "var(--ch-whatsapp)" },
  DIRECT: { label: "Direto", color: "var(--ch-direct)" },
  MANUAL: { label: "Manual", color: "var(--ch-manual)" },
  OTHER: { label: "Outro", color: "var(--ch-other)" },
};
const BLOCK_REASONS: Record<string, string> = {
  MAINTENANCE: "Manutenção",
  OWNER_USE: "Uso do proprietário",
  CLEANING: "Limpeza",
  ADMINISTRATIVE: "Administrativo",
  OTHER: "Outro",
};

const dm = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const weekday = (d: IsoDate) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)).replace(".", "");
const isWeekend = (d: IsoDate) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Panel = { type: "item"; item: CalendarItem } | { type: "new"; unitId?: string; checkIn?: IsoDate; mode: "reservation" | "block" } | null;

export function CalendarBoard({
  data,
  today,
  canReserve,
  canBlock,
}: {
  data: CalendarData;
  today: IsoDate;
  canReserve: boolean;
  canBlock: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const dates = useMemo(() => Array.from({ length: data.days }, (_, i) => addDays(data.start, i)), [data.start, data.days]);
  const todayIdx = diffDays(data.start, today);
  const unitById = useMemo(() => new Map(data.units.map((u) => [u.id, u])), [data.units]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = (days: number) => `/calendario?inicio=${addDays(data.start, days)}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn" href={nav(-7)} aria-label="Semana anterior">←</Link>
          <Link className="btn" href={`/calendario?inicio=${addDays(today, -2)}`}>Hoje</Link>
          <Link className="btn" href={nav(7)} aria-label="Próxima semana">→</Link>
          <span className="text-sm text-mute">
            {dm(data.start)} a {dm(addDays(data.start, data.days - 1))}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canBlock && <button className="btn" onClick={() => setPanel({ type: "new", mode: "block" })}>Bloquear datas</button>}
          {canReserve && <button className="btn btn-primary" onClick={() => setPanel({ type: "new", mode: "reservation" })}>+ Nova reserva</button>}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {Object.entries(CHANNELS).map(([k, c]) => (
          <span key={k} className="chip">
            <span className="size-2 rounded-full" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
        <span className="chip"><span className="size-2 rounded-full bg-[var(--block)]" />Bloqueio</span>
        <span className="chip">Listras = pré-reserva</span>
      </div>

      {data.units.length === 0 ? (
        <div className="rounded-[14px] border border-line p-8 text-center text-mute">
          Nenhum imóvel cadastrado ainda. Rode <code>npm run db:seed</code> para os dados de desenvolvimento.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-line">
          <div className="tl" style={{ ["--n" as string]: data.days }}>
            <div className="tl-row">
              <div className="tl-unit border-b border-line" />
              {dates.map((d) => (
                <div key={d} className={`tl-day ${d === today ? "today" : ""} ${isWeekend(d) ? "weekend" : ""}`}>
                  {weekday(d)}
                  <br />
                  {d.slice(8, 10)}
                </div>
              ))}
            </div>
            {data.units.map((u) => (
              <div key={u.id} className="tl-row tl-lane">
                <div className="tl-unit">
                  <b className="text-sm">Flat {u.code}</b>
                  <span className="truncate text-mute">{u.propertyName}</span>
                </div>
                {dates.map((d) => (
                  canReserve ? (
                    <button
                      key={d}
                      className={`tl-cell ${isWeekend(d) ? "weekend" : ""} hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]`}
                      aria-label={`Nova reserva no Flat ${u.code} a partir de ${dm(d)}`}
                      onClick={() => setPanel({ type: "new", mode: "reservation", unitId: u.id, checkIn: d })}
                    />
                  ) : (
                    <div key={d} className={`tl-cell ${isWeekend(d) ? "weekend" : ""}`} />
                  )
                ))}
                {data.items
                  .filter((it) => it.unitId === u.id)
                  .map((it) => {
                    const a = Math.max(diffDays(data.start, it.checkIn) + 0.5, 0);
                    const b = Math.min(diffDays(data.start, it.checkOut) + 0.42, data.days);
                    if (b <= 0 || a >= data.days) return null;
                    const r = it.reservation;
                    const color = it.kind === "BLOCK" ? undefined : CHANNELS[r?.channel ?? it.source]?.color;
                    return (
                      <button
                        key={it.occupancyId}
                        className={`tl-bar ${it.kind === "BLOCK" ? "block" : ""} ${r?.status === "HOLD" ? "hold" : ""}`}
                        style={{ left: `calc(var(--label) + ${a} * var(--col))`, width: `calc(${b - a} * var(--col) - 3px)`, background: color }}
                        onClick={() => setPanel({ type: "item", item: it })}
                      >
                        {it.kind === "BLOCK" ? BLOCK_REASONS[it.blockReason ?? "OTHER"] : (r?.guestName ?? r?.code)}
                        <small className="block opacity-85">
                          {dm(it.checkIn)} → {dm(it.checkOut)}
                        </small>
                      </button>
                    );
                  })}
              </div>
            ))}
            {todayIdx >= 0 && todayIdx < data.days && (
              <div className="tl-now" style={{ left: `calc(var(--label) + ${todayIdx + 0.5} * var(--col))` }} />
            )}
          </div>
        </div>
      )}

      {panel && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" onClick={() => setPanel(null)} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={panel.type === "item" ? "Detalhes" : panel.mode === "block" ? "Bloquear datas" : "Nova reserva"}
            className="fixed inset-y-0 right-0 z-30 w-full max-w-[400px] overflow-y-auto border-l border-line bg-bg p-5 shadow-2xl"
          >
            {panel.type === "item" ? (
              <ItemDetails
                item={panel.item}
                unitLabel={`Flat ${unitById.get(panel.item.unitId)?.code ?? ""}`}
                canChange={panel.item.reservation ? canReserve : canBlock}
                onDone={() => setPanel(null)}
              />
            ) : (
              <NewForm key={`${panel.mode}-${panel.unitId}-${panel.checkIn}`} panel={panel} units={data.units} onDone={() => setPanel(null)} />
            )}
            <button className="btn mt-4" onClick={() => setPanel(null)}>Fechar</button>
          </aside>
        </>
      )}
    </>
  );
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={`mt-3 rounded-[10px] border p-3 text-sm ${result.ok ? "border-ok text-ok" : "border-warn bg-warn-bg text-warn-ink"}`}
    >
      <b>{result.message}</b>
      {result.conflicts && (
        <ul className="mt-1 list-disc pl-5">
          {result.conflicts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDetails({ item, unitLabel, canChange, onDone }: { item: CalendarItem; unitLabel: string; canChange: boolean; onDone: () => void }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const r = item.reservation;
  const nights = diffDays(item.checkIn, item.checkOut);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) setTimeout(onDone, 900);
    });

  if (!r) {
    return (
      <>
        <h2 className="text-lg font-bold">{unitLabel} bloqueado</h2>
        <p className="mt-2">{BLOCK_REASONS[item.blockReason ?? "OTHER"]}{item.note ? `: ${item.note}` : ""}</p>
        <p className="text-mute">{dm(item.checkIn)} → {dm(item.checkOut)} · {nights} noite(s)</p>
        {canChange && (
          <button className="btn mt-4" disabled={pending} onClick={() => run(() => releaseBlockAction(item.occupancyId))}>
            {pending ? "Liberando…" : "Liberar bloqueio"}
          </button>
        )}
        <Feedback result={result} />
      </>
    );
  }
  return (
    <>
      <h2 className="text-lg font-bold">{r.guestName ?? "Hóspede não informado"}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="chip"><span className="size-2 rounded-full" style={{ background: CHANNELS[r.channel]?.color }} />{CHANNELS[r.channel]?.label}</span>
        <span className="chip">{STATUS_LABEL[r.status as ReservationStatus] ?? r.status}</span>
        <span className="chip">{r.code}</span>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-mute">Imóvel</dt><dd>{unitLabel}</dd>
        <dt className="text-mute">Período</dt><dd>{dm(item.checkIn)} → {dm(item.checkOut)} ({nights} noite{nights > 1 ? "s" : ""})</dd>
        <dt className="text-mute">Hóspedes</dt><dd>{r.guestCount}</dd>
        <dt className="text-mute">Valor total</dt><dd>{brl(r.totalAmount)}</dd>
        <dt className="text-mute">Líquido</dt><dd>{brl(r.netAmount)}</dd>
        {r.holdExpiresAt && (<><dt className="text-mute">Pré-reserva vence</dt><dd>{new Date(r.holdExpiresAt).toLocaleString("pt-BR")}</dd></>)}
      </dl>
      {canChange && ["HOLD", "CONFIRMED"].includes(r.status) && (
        <button className="btn mt-4" disabled={pending} onClick={() => run(() => cancelReservationAction(r.id))}>
          {pending ? "Cancelando…" : "Cancelar reserva e liberar datas"}
        </button>
      )}
      <Feedback result={result} />
    </>
  );
}

function NewForm({
  panel,
  units,
  onDone,
}: {
  panel: Extract<Panel, { type: "new" }>;
  units: CalendarData["units"];
  onDone: () => void;
}) {
  const [mode, setMode] = useState(panel.mode);
  const [resState, resAction, resPending] = useActionState(createReservationAction, null);
  const [blkState, blkAction, blkPending] = useActionState(createBlockAction, null);
  const [, startTransition] = useTransition();
  const state = mode === "reservation" ? resState : blkState;
  // Envio manual (sem form action) para o React não limpar o formulário quando a data está ocupada.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => (mode === "reservation" ? resAction : blkAction)(fd));
  };
  const checkIn = panel.checkIn ?? "";
  const checkOut = panel.checkIn ? addDays(panel.checkIn, 2) : "";

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
  }, [state, onDone]);

  const label = "mb-1 mt-3 block text-[13px] text-mute";
  return (
    <>
      <div className="mb-3 flex gap-1 rounded-[10px] bg-soft p-1">
        {(["reservation", "block"] as const).map((m) => (
          <button key={m} className={`btn flex-1 border-0 ${mode === m ? "" : "bg-transparent"}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
            {m === "reservation" ? "Reserva" : "Bloqueio"}
          </button>
        ))}
      </div>
      <form onSubmit={submit}>
        <label className={label} htmlFor="unitId">Imóvel</label>
        <select className="field" id="unitId" name="unitId" defaultValue={panel.unitId ?? units[0]?.id} required>
          {units.map((u) => (
            <option key={u.id} value={u.id}>Flat {u.code} · {u.propertyName}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="checkIn">{mode === "reservation" ? "Check-in" : "De"}</label>
            <input className="field" type="date" id="checkIn" name="checkIn" defaultValue={checkIn} required />
          </div>
          <div>
            <label className={label} htmlFor="checkOut">{mode === "reservation" ? "Check-out" : "Até (dia livre)"}</label>
            <input className="field" type="date" id="checkOut" name="checkOut" defaultValue={checkOut} required />
          </div>
        </div>
        {mode === "reservation" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="channel">Canal</label>
                <select className="field" id="channel" name="channel" defaultValue="AIRBNB">
                  {Object.entries(CHANNELS).map(([k, c]) => (
                    <option key={k} value={k}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="status">Status</label>
                <select className="field" id="status" name="status" defaultValue="CONFIRMED">
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="HOLD">Pré-reserva (24 h)</option>
                  <option value="INQUIRY">Consulta (não ocupa)</option>
                </select>
              </div>
            </div>
            <label className={label} htmlFor="guestName">Hóspede</label>
            <input className="field" id="guestName" name="guestName" autoComplete="off" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="guestPhone">Telefone</label>
                <input className="field" id="guestPhone" name="guestPhone" inputMode="tel" autoComplete="off" />
              </div>
              <div>
                <label className={label} htmlFor="guestCount">Pessoas</label>
                <input className="field" id="guestCount" name="guestCount" type="number" min={1} max={20} defaultValue={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="totalAmount">Valor total (R$)</label>
                <input className="field" id="totalAmount" name="totalAmount" inputMode="decimal" placeholder="0,00" />
              </div>
              <div>
                <label className={label} htmlFor="channelFee">Taxa do canal (R$)</label>
                <input className="field" id="channelFee" name="channelFee" inputMode="decimal" placeholder="0,00" />
              </div>
            </div>
            <label className={label} htmlFor="notes">Observações</label>
            <textarea className="field min-h-20" id="notes" name="notes" />
            <button className="btn btn-primary mt-4 w-full" disabled={resPending}>{resPending ? "Salvando…" : "Salvar reserva"}</button>
          </>
        ) : (
          <>
            <label className={label} htmlFor="reason">Motivo</label>
            <select className="field" id="reason" name="reason" defaultValue="MAINTENANCE">
              {Object.entries(BLOCK_REASONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <label className={label} htmlFor="note">Observação</label>
            <input className="field" id="note" name="note" placeholder="Ex.: trocar resistência do chuveiro" />
            <button className="btn btn-primary mt-4 w-full" disabled={blkPending}>{blkPending ? "Bloqueando…" : "Bloquear datas"}</button>
          </>
        )}
      </form>
      <Feedback result={state} />
    </>
  );
}
