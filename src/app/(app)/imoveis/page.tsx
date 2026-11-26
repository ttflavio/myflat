import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/server/db";
import { getSession } from "@/server/session";
import { can } from "@/server/tenant";
import { listProperties } from "@/server/units/service";
import { PropertiesBoard } from "./properties-board";

export const metadata: Metadata = { title: "Imóveis" };

async function Loader() {
  const session = await getSession();
  const data = await listProperties(getDb(), session);
  return <PropertiesBoard {...data} canEdit={can(session, "unit:write")} />;
}

export default function ImoveisPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[clamp(26px,3vw,34px)] font-bold">Imóveis</h1>
        <p className="mt-1 text-mute">Os dados de cada flat. O que estiver em branco ainda não foi informado.</p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-[14px] bg-soft" />}>
        <Loader />
      </Suspense>
    </>
  );
}
