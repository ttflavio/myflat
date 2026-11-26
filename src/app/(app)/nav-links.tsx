"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; ready: boolean };

export function NavLinks({ canManageUsers, canSeeFinance, locked }: { canManageUsers: boolean; canSeeFinance: boolean; locked: boolean }) {
  const pathname = usePathname();
  const sections: { title: string; items: Item[] }[] = [
    { title: "Visão geral", items: [{ href: "/painel", label: "Painel", ready: true }] },
    {
      title: "Gestão",
      items: [
        { href: "/calendario", label: "Calendário", ready: true },
        { href: "/reservas", label: "Reservas", ready: true },
        { href: "/imoveis", label: "Imóveis", ready: true },
      ],
    },
    {
      title: "Operação",
      items: [{ href: "/pendencias", label: "Pendências", ready: true }],
    },
    { title: "Atendimento", items: [{ href: "/inbox", label: "Inbox", ready: false }] },
    ...(canSeeFinance ? [{ title: "Financeiro", items: [{ href: "/financeiro", label: "Financeiro", ready: false }] }] : []),
    {
      title: "Configurações",
      items: [
        ...(canManageUsers ? [{ href: "/configuracoes/usuarios", label: "Usuários", ready: true }] : []),
        { href: "/conta", label: "Minha conta", ready: true },
      ],
    },
  ];

  return (
    <nav className="flex shrink-0 gap-0.5 md:block">
      {sections.map((s) => (
        <div key={s.title} className="contents md:block">
          <small className="mx-2.5 mb-1 mt-3.5 hidden text-xs opacity-55 md:block">{s.title}</small>
          {s.items.map((i) =>
            i.ready && (!locked || i.href === "/conta") ? (
              <Link
                key={i.href}
                href={i.href}
                className={`flex min-h-10 shrink-0 items-center rounded-lg px-2.5 text-sm whitespace-nowrap ${
                  pathname.startsWith(i.href) ? "bg-white font-semibold text-side" : "hover:bg-white/10"
                }`}
              >
                {i.label}
              </Link>
            ) : (
              <span
                key={i.href}
                title={locked ? "Troque a senha provisória primeiro" : "Em construção"}
                className="flex min-h-10 shrink-0 cursor-default items-center justify-between gap-2 rounded-lg px-2.5 text-sm whitespace-nowrap opacity-45"
              >
                {i.label}
                {!i.ready && <span className="hidden text-[11px] md:inline">em breve</span>}
              </span>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
