import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/server/session";
import { can } from "@/server/tenant";
import { ROLE_LABEL } from "@/server/auth/members";
import { logoutAction } from "../auth-actions";
import { NavLinks } from "./nav-links";

async function SideContent() {
  const s = await readSession();
  if (!s) redirect("/login");
  return (
    <>
      <div className="mb-4 hidden rounded-[10px] bg-white/10 px-3 py-2.5 text-[13px] md:block">
        <b className="block text-sm">{s.organizationName}</b>
        <span className="opacity-75">{s.userName} · {ROLE_LABEL[s.role]}</span>
      </div>
      <NavLinks
        canManageUsers={can(s, "settings:write")}
        canSeeFinance={can(s, "finance:read")}
        locked={s.mustChangePassword}
      />
      <form action={logoutAction} className="shrink-0 md:mt-4">
        <button className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-sm whitespace-nowrap opacity-80 hover:bg-white/10">
          Sair
        </button>
      </form>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="z-10 flex items-center gap-2 overflow-x-auto bg-side px-3 py-2.5 text-side-ink md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto md:px-3.5 md:py-5">
        <div className="flex shrink-0 items-center gap-2.5 px-2 font-display text-xl font-bold md:pb-4">
          <span className="grid size-[30px] place-items-center rounded-lg bg-[#3fb3a6] text-side">M</span>
          MyFlat
        </div>
        <Suspense fallback={<div className="h-10 w-40 rounded-lg bg-white/10 md:h-[300px] md:w-full" />}>
          <SideContent />
        </Suspense>
      </aside>
      <main className="min-w-0 px-4 pb-16 pt-5 md:px-[3vw] md:pt-6">{children}</main>
    </div>
  );
}
