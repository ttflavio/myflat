import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { todayIn, type IsoDate } from "@/domain/availability/dates";
import type { DayOccupancy } from "@/domain/dashboard/day";
import { CATEGORY_LABEL, type TaskCategoryName } from "@/domain/tasks/labels";
import { getDashboard, type DashboardData } from "@/server/dashboard/queries";
import { getDb } from "@/server/db";
import { getSession } from "@/server/session";
import type { TaskView } from "@/server/tasks/service";

export const metadata: Metadata = { title: "Painel" };

const CH: Record<string, string> = { AIRBNB: "Airbnb", BOOKING: "Booking.com", DECOLAR: "Decolar", WHATSAPP: "WhatsApp", DIRECT: "Direto", MANUAL: "Manual", OTHER: "Outro" };
const BLOCK: Record<string, string> = { MAINTENANCE: "Manutenção", OWNER_USE: "Uso do proprietário", CLEANING: "Limpeza", ADMINISTRATIVE: "Administrativo", OTHER: "Bloqueio" };
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" ? "border-warn bg-warn-bg" : "border-line"}`}>
      <span className="text-[13px] text-mute">{label}</span>
      <b className="block font-display text-[clamp(20px,2.4vw,26px)] tabular-nums">{value}</b>
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {href && <Link className="text-sm text-brand" href={href}>Abrir</Link>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-mute">{children}</p>;
}

function OccRow({ o, unit, what }: { o: DayOccupancy; unit: string; what: string }) {
  return (
    <li className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
      <div>
        <b className="text-sm">{what} · Flat {unit}</b>
        <div className="text-[13px] text-mute">{o.guestName ?? "Hóspede não informado"} · {dm(o.checkIn)} → {dm(o.checkOut)}</div>
      </div>
      {o.channel && <span className="chip">{CH[o.channel] ?? o.channel}</span>}
    </li>
  );
}

function TaskRow({ t, unit, today }: { t: TaskView; unit: string | null; today: IsoDate }) {
  const late = t.dueDate && t.dueDate < today;
  return (
    <li className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
      <div>
        <b className="text-sm">{unit ? `Flat ${unit}` : "Triagem"} · {t.title}</b>
        <div className="text-[13px] text-mute">{CATEGORY_LABEL[t.category as TaskCategoryName] ?? t.category}</div>
      </div>
      <span className={`chip ${late ? "border-warn text-warn-ink" : ""}`}>
        {t.dueDate ? (late ? `Atrasada · ${dm(t.dueDate)}` : t.dueDate === today ? "Hoje" : dm(t.dueDate)) : "Urgente"}
      </span>
    </li>
  );
}

function Board({ d }: { d: DashboardData }) {
  const code = new Map(d.units.map((u) => [u.id, u.code]));
  const occupied = d.units.filter((u) => u.state === "occupied").length;
  const blocked = d.units.filter((u) => u.state === "blocked").length;
  const urgentTasks = [...d.tasks.overdue, ...d.tasks.dueToday, ...d.tasks.urgent];
  const incomplete = d.units.filter((u) => u.missing.length);

  return (
    <div className="grid gap-4">
      {d.reservationsTotal === 0 && (
        <p className="rounded-[10px] border border-line bg-soft p-3 text-sm">
          Ainda não há reservas cadastradas, então ocupação, check-ins e receita aparecem zerados.{" "}
          <Link className="font-semibold text-brand" href="/calendario">Cadastrar no calendário</Link>
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <Kpi label="Flats" value={d.units.length} />
        <Kpi label="Ocupados hoje" value={occupied} />
        <Kpi label="Livres hoje" value={d.units.length - occupied - blocked} />
        <Kpi label="Bloqueados hoje" value={blocked} />
        <Kpi label="Check-ins hoje" value={d.checkIns.length} />
        <Kpi label="Check-outs hoje" value={d.checkOuts.length} />
        <Kpi label="Pendências abertas" value={d.tasks.open} />
        <Kpi label="Atrasadas" value={d.tasks.overdue.length} tone={d.tasks.overdue.length ? "warn" : undefined} />
        {d.month && <Kpi label={`Ocupação em ${d.month.label}`} value={`${Math.round(d.month.occupancyRate * 100)}%`} />}
        {d.month && <Kpi label={`Líquido previsto em ${d.month.label}`} value={brl(d.month.netForecast)} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Agenda de hoje" href="/calendario">
          {d.checkOuts.length + d.checkIns.length + d.blockedToday.length === 0 ? (
            <Empty>Nenhum check-in, check-out ou bloqueio hoje.</Empty>
          ) : (
            <ul>
              {d.checkOuts.map((o) => <OccRow key={`o-${o.id}`} o={o} unit={code.get(o.unitId) ?? "?"} what="Check-out" />)}
              {d.checkIns.map((o) => <OccRow key={`i-${o.id}`} o={o} unit={code.get(o.unitId) ?? "?"} what="Check-in" />)}
              {d.blockedToday.map((o) => (
                <li key={`b-${o.id}`} className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                  <div>
                    <b className="text-sm">Bloqueado · Flat {code.get(o.unitId)}</b>
                    <div className="text-[13px] text-mute">{BLOCK[o.blockReason ?? "OTHER"]} até {dm(o.checkOut)}</div>
                  </div>
                  <span className="chip">Bloqueio</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Pendências que pedem atenção" href="/pendencias">
          {urgentTasks.length === 0 ? (
            <Empty>Nada atrasado, para hoje ou urgente.{d.tasks.triage ? ` ${d.tasks.triage} na triagem.` : ""}</Empty>
          ) : (
            <ul>
              {urgentTasks.slice(0, 8).map((t) => <TaskRow key={t.id} t={t} unit={t.unitId ? (code.get(t.unitId) ?? null) : null} today={d.today} />)}
            </ul>
          )}
        </Panel>

        <Panel title="Próximos check-ins (7 dias)" href="/calendario">
          {d.upcoming.length === 0 ? (
            <Empty>Nenhum check-in nos próximos 7 dias.</Empty>
          ) : (
            <ul>{d.upcoming.map((o) => <OccRow key={o.id} o={o} unit={code.get(o.unitId) ?? "?"} what={dm(o.checkIn)} />)}</ul>
          )}
        </Panel>

        <Panel title="Flats" href="/imoveis">
          <ul>
            {d.units.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                <div>
                  <b className="text-sm">Flat {u.code}</b> <span className="text-[13px] text-mute">· {u.building}</span>
                  {u.missing.length > 0 && <div className="text-[13px] text-warn-ink">Falta: {u.missing.join(", ")}</div>}
                </div>
                <span className="chip">{u.state === "occupied" ? "Ocupado" : u.state === "blocked" ? "Bloqueado" : "Livre"}</span>
              </li>
            ))}
          </ul>
          {incomplete.length > 0 && <p className="mt-2 text-[13px] text-mute">{incomplete.length} de {d.units.length} flats com dados a completar.</p>}
        </Panel>
      </div>
    </div>
  );
}

async function Loader() {
  const session = await getSession();
  const today = todayIn();
  const data = await getDashboard(getDb(), session, today);
  return <Board d={data} />;
}

function Today() {
  return (
    <Suspense fallback={<span className="text-mute">&nbsp;</span>}>
      <TodayLabel />
    </Suspense>
  );
}

async function TodayLabel() {
  await getSession();
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Fortaleza" }).format(new Date());
  return <span className="text-mute first-letter:uppercase">{label}</span>;
}

export default function PainelPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[clamp(26px,3vw,34px)] font-bold">Painel do dia</h1>
        <p className="mt-1"><Today /></p>
      </div>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-[14px] bg-soft" />}>
        <Loader />
      </Suspense>
    </>
  );
}
