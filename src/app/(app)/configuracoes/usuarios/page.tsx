import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/server/db";
import { can } from "@/server/tenant";
import { listMembers } from "@/server/auth/members";
import { getSession } from "@/server/session";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "Usuários" };

async function Users() {
  const s = await getSession();
  if (!can(s, "settings:write")) {
    return <p className="rounded-[14px] border border-line p-6 text-mute">Só a administração da organização gerencia usuários.</p>;
  }
  const members = await listMembers(getDb(), s); // checa a permissão de novo no serviço
  return <UsersManager members={members} myRole={s.role} />;
}

export default function UsersPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[clamp(26px,3vw,34px)] font-bold">Usuários</h1>
        <p className="mt-1 text-mute">Quem acessa o MyFlat e o que cada pessoa pode fazer. As permissões valem no servidor, não só na tela.</p>
      </div>
      <Suspense fallback={<div className="h-60 animate-pulse rounded-[14px] bg-soft" />}>
        <Users />
      </Suspense>
    </>
  );
}
