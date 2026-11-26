import type { Metadata } from "next";
import { Suspense } from "react";
import { todayIn } from "@/domain/availability/dates";
import { getDb } from "@/server/db";
import { filtersFromSearch, listReservations } from "@/server/reservations/queries";
import { getSession } from "@/server/session";
import { can } from "@/server/tenant";
import { ReservationsBoard } from "./reservations-board";

export const metadata: Metadata = { title: "Reservas" };

async function Loader({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  const sp = await searchParams;
  const filters = filtersFromSearch(sp);
  const db = getDb();
  const [rows, units] = await Promise.all([
    listReservations(db, session, filters, todayIn()),
    db.unit.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE" },
      include: { property: { select: { name: true } } },
      orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    }),
  ]);
  return (
    <ReservationsBoard
      rows={rows}
      units={units.map((u) => ({ id: u.id, code: u.code, building: u.property.name }))}
      filters={filters}
      canWrite={can(session, "reservation:write")}
      showMoney={can(session, "finance:read")}
    />
  );
}

export default function ReservasPage(props: PageProps<"/reservas">) {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[clamp(26px,3vw,34px)] font-bold">Reservas</h1>
        <p className="mt-1 text-mute">Todas as reservas, de todos os canais, com filtros e mudança de status.</p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-[14px] bg-soft" />}>
        <Loader searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
