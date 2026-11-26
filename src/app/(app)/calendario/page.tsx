import type { Metadata } from "next";
import { Suspense } from "react";
import { addDays, isIsoDate, todayIn } from "@/domain/availability/dates";
import { getCalendar } from "@/server/calendar/queries";
import { getDb } from "@/server/db";
import { getSession } from "@/server/session";
import { can } from "@/server/tenant";
import { CalendarBoard } from "./calendar-board";

export const metadata: Metadata = { title: "Calendário" };

const DAYS = 21;

async function CalendarLoader({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession(); // primeiro: torna a página dinâmica antes de olhar o relógio
  const sp = await searchParams;
  const today = todayIn();
  const raw = typeof sp.inicio === "string" ? sp.inicio : "";
  const start = isIsoDate(raw) ? raw : addDays(today, -2);
  const data = await getCalendar(getDb(), session, start, DAYS);
  return (
    <CalendarBoard
      data={data}
      today={today}
      canReserve={can(session, "reservation:write")}
      canBlock={can(session, "availability:block")}
    />
  );
}

function CalendarSkeleton() {
  return (
    <div className="animate-pulse rounded-[14px] border border-line p-4" aria-busy="true" aria-label="Carregando calendário">
      <div className="mb-3 h-10 w-72 rounded-lg bg-soft" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mb-2 h-12 rounded-lg bg-soft" />
      ))}
    </div>
  );
}

export default function CalendarPage(props: PageProps<"/calendario">) {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[clamp(26px,3vw,34px)] font-bold">Calendário</h1>
        <p className="mt-1 text-mute">
          Todas as reservas e bloqueios num lugar só. O banco recusa qualquer sobreposição de datas.
        </p>
      </div>
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarLoader searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
