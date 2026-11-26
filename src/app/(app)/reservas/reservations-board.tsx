"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { diffDays } from "@/domain/availability/dates";
import { allowedTransitions, RESERVATION_STATUSES, STATUS_LABEL, type ReservationStatus } from "@/domain/reservations/status";
import type { ReservationFilters, ReservationRow } from "@/server/reservations/queries";
import { changeDatesAction, changeStatusAction, type ResResult } from "./actions";

type Unit = { id: string; code: string; building: string };

const CHANNELS: Record<string, string> = { AIRBNB: "Airbnb", BOOKING: "Booking.com", DECOLAR: "Decolar", WHATSAPP: "WhatsApp", DIRECT: "Direto", MANUAL: "Manual", OTHER: "Outro" };
const PERIODS: Record<string, string> = { upcoming: "Próximas", current: "Em andamento", past: "Passadas", all: "Todas" };
const ACTION_LABEL: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: "Confirmar",
  CHECKED_IN: "Registrar check-in",
  IN_STAY: "Hospedagem em andamento",
  COMPLETED: "Finalizar",
  CANCELLED: "Cancelar reserva",
  NO_SHOW: "Marcar no-show",
  HOLD: "Virar pré-reserva",
  AWAITING_CONFIRM: "Aguardando confirmação",
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Notice({ r }: { r: ResResult }) {
  if (!r) return null;
  return (
    <p role="status" className={`mt-3 rounded-[10px] border p-3 text-sm ${r.ok ? "border-ok" : "border-warn bg-warn-bg text-warn-ink"}`}>
      {r.message}
    </p>
  );
}

function Details({ r, canWrite, showMoney, onClose }: { r: ReservationRow; canWrite: boolean; showMoney: boolean; onClose: () => void }) {
  const [result, setResult] = useState<ResResult>(null);
  const [pending, start] = useTransition();
  const [checkIn, setCheckIn] = useState(r.checkIn);
  const [checkOut, setCheckOut] = useState(r.checkOut);
  const next = allowedTransitions(r.status as ReservationStatus);
  const closed = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(r.status);
  const run = (fn: () => Promise<ResResult>) => start(async () => setResult(await fn()));
  const nights = diffDays(r.checkIn, r.checkOut);

  return (
    <>
      <h2 className="text-lg font-bold">{r.guestName ?? "Hóspede não informado"}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="chip">{STATUS_LABEL[r.status as ReservationStatus] ?? r.status}</span>
        <span className="chip">{CHANNELS[r.channel] ?? r.channel}</span>
        <span className="chip">{r.code}</span>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-mute">Flat</dt><dd>{r.unitCode} · {r.building}</dd>
        <dt className="text-mute">Período</dt><dd>{dm(r.checkIn)} → {dm(r.checkOut)} ({nights} noite{nights > 1 ? "s" : ""})</dd>
        <dt className="text-mute">Hóspedes</dt><dd>{r.guestCount}</dd>
        {r.guestPhone && (<><dt className="text-mute">Telefone</dt><dd>{r.guestPhone}</dd></>)}
        {showMoney && (
          <>
            <dt className="text-mute">Total</dt><dd>{brl(r.totalAmount)}</dd>
            <dt className="text-mute">Taxa do canal</dt><dd>{brl(r.channelFee)}</dd>
            <dt className="text-mute">Líquido</dt><dd>{brl(r.netAmount)}</dd>
          </>
        )}
        {r.holdExpiresAt && (<><dt className="text-mute">Pré-reserva vence</dt><dd>{new Date(r.holdExpiresAt).toLocaleString("pt-BR")}</dd></>)}
      </dl>
      {r.notes && <p className="mt-3 rounded-lg bg-soft p-2.5 text-sm">{r.notes}</p>}

      {canWrite && next.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Próximo passo</h3>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                className={`btn ${s === "CANCELLED" || s === "NO_SHOW" ? "text-warn-ink" : ""}`}
                disabled={pending}
                onClick={() => {
                  if ((s === "CANCELLED" || s === "NO_SHOW") && !window.confirm(`${ACTION_LABEL[s]}? As datas ficam livres no calendário.`)) return;
                  run(() => changeStatusAction(r.id, s));
                }}
              >
                {ACTION_LABEL[s] ?? STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {canWrite && !closed && (
        <form
          className="mt-4 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changeDatesAction(r.id, checkIn, checkOut));
          }}
        >
          <h3 className="mb-1 text-sm font-semibold">Mudar datas</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] text-mute" htmlFor="d-in">Check-in</label>
              <input className="field" id="d-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-mute" htmlFor="d-out">Check-out</label>
              <input className="field" id="d-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
            </div>
          </div>
          <button className="btn mt-3" disabled={pending || (checkIn === r.checkIn && checkOut === r.checkOut)}>
            {pending ? "Salvando…" : "Salvar novas datas"}
          </button>
        </form>
      )}
      <Notice r={result} />
      <button className="btn mt-4" onClick={onClose}>Fechar</button>
    </>
  );
}

export function ReservationsBoard({
  rows,
  units,
  filters,
  canWrite,
  showMoney,
}: {
  rows: ReservationRow[];
  units: Unit[];
  filters: ReservationFilters;
  canWrite: boolean;
  showMoney: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = "mb-1 block text-[13px] text-mute";
  const filtered = Object.entries(filters).some(([k, v]) => v && !(k === "period" && v === "upcoming"));

  return (
    <>
      <form method="get" className="mb-4 grid gap-3 rounded-[14px] border border-line p-3 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto] sm:items-end">
        <div>
          <label className={label} htmlFor="f-periodo">Período</label>
          <select className="field" id="f-periodo" name="periodo" defaultValue={filters.period ?? "upcoming"}>
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-flat">Flat</label>
          <select className="field" id="f-flat" name="flat" defaultValue={filters.unitId ?? ""}>
            <option value="">Todos</option>
            {units.map((u) => <option key={u.id} value={u.id}>Flat {u.code}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-canal">Canal</label>
          <select className="field" id="f-canal" name="canal" defaultValue={filters.channel ?? ""}>
            <option value="">Todos</option>
            {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-status">Status</label>
          <select className="field" id="f-status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos</option>
            {RESERVATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-q">Buscar</label>
          <input className="field" id="f-q" name="q" defaultValue={filters.q ?? ""} placeholder="Hóspede, telefone ou código" />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary">Filtrar</button>
          {filtered && <Link className="btn" href="/reservas">Limpar</Link>}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-mute">{rows.length} reserva{rows.length === 1 ? "" : "s"}{rows.length === 300 ? " (mostrando as 300 primeiras)" : ""}</span>
        {canWrite && <Link className="btn btn-primary" href="/calendario">+ Nova reserva no calendário</Link>}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[14px] border border-line p-8 text-center text-mute">
          {filtered ? "Nenhuma reserva com esses filtros." : "Nenhuma reserva próxima. As novas reservas entram pelo calendário."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-line">
          <table className="stack w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[13px] text-mute">
                <th className="border-b border-line px-3 py-2 font-medium">Flat</th>
                <th className="border-b border-line px-3 py-2 font-medium">Hóspede</th>
                <th className="border-b border-line px-3 py-2 font-medium">Período</th>
                <th className="border-b border-line px-3 py-2 font-medium">Canal</th>
                <th className="border-b border-line px-3 py-2 font-medium">Status</th>
                {showMoney && <th className="border-b border-line px-3 py-2 text-right font-medium">Líquido</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-soft" onClick={() => setOpenId(r.id)}>
                  <td data-l="Flat" className="border-b border-line px-3 py-2.5"><b>{r.unitCode}</b></td>
                  <td data-l="Hóspede" className="border-b border-line px-3 py-2.5">
                    <button className="text-left underline-offset-2 hover:underline" onClick={() => setOpenId(r.id)}>
                      {r.guestName ?? "Não informado"}
                    </button>
                  </td>
                  <td data-l="Período" className="whitespace-nowrap border-b border-line px-3 py-2.5">{dm(r.checkIn)} → {dm(r.checkOut)}</td>
                  <td data-l="Canal" className="border-b border-line px-3 py-2.5">{CHANNELS[r.channel] ?? r.channel}</td>
                  <td data-l="Status" className="border-b border-line px-3 py-2.5"><span className="chip">{STATUS_LABEL[r.status as ReservationStatus] ?? r.status}</span></td>
                  {showMoney && <td data-l="Líquido" className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right tabular-nums">{brl(r.netAmount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" onClick={() => setOpenId(null)} />
          <aside role="dialog" aria-modal="true" aria-label="Detalhes da reserva" className="fixed inset-y-0 right-0 z-30 w-full max-w-[420px] overflow-y-auto border-l border-line bg-bg p-5 shadow-2xl">
            <Details key={open.id} r={open} canWrite={canWrite} showMoney={showMoney} onClose={() => setOpenId(null)} />
          </aside>
        </>
      )}
    </>
  );
}
