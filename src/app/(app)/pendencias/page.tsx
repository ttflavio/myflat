import type { Metadata } from "next";
import { Suspense } from "react";
import { todayIn } from "@/domain/availability/dates";
import { aiConfigured } from "@/server/ai/capture";
import { getDb } from "@/server/db";
import { getSession } from "@/server/session";
import { listTasks } from "@/server/tasks/service";
import { can } from "@/server/tenant";
import { PendenciasBoard } from "./pendencias-board";

export const metadata: Metadata = { title: "Pendências" };

async function Loader() {
  const session = await getSession();
  const db = getDb();
  const [tasks, units] = await Promise.all([
    listTasks(db, session),
    db.unit.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE" },
      include: { property: { select: { name: true } } },
      orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    }),
  ]);
  return (
    <PendenciasBoard
      tasks={tasks}
      units={units.map((u) => ({ id: u.id, code: u.code, building: u.property.name }))}
      today={todayIn()}
      aiReady={aiConfigured()}
      canWrite={can(session, "task:write")}
    />
  );
}

export default function PendenciasPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[clamp(26px,3vw,34px)] font-bold">Pendências</h1>
        <p className="mt-1 text-mute">Tudo o que precisa ser feito em cada flat, num lugar só.</p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-[14px] bg-soft" />}>
        <Loader />
      </Suspense>
    </>
  );
}
