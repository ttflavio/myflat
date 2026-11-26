"use client";

import { useActionState, useState, useTransition } from "react";
import { ROLE_HINT, ROLE_LABEL, ROLES, type RoleName } from "@/domain/auth/roles";
import { addMemberAction, changeRoleAction, removeMemberAction, resetPasswordAction, type UsersActionResult } from "./actions";

type Member = { membershipId: string; name: string; email: string; role: RoleName; pendingPassword: boolean; isMe: boolean };

function Notice({ result }: { result: UsersActionResult }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  return (
    <div role="status" className={`mt-3 rounded-[10px] border p-3 text-sm ${result.ok ? "border-ok" : "border-warn bg-warn-bg text-warn-ink"}`}>
      <b>{result.message}</b>
      {result.temporaryPassword && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-soft px-2 py-1 text-base tracking-wide">{result.temporaryPassword}</code>
          <button
            type="button"
            className="btn"
            onClick={() => navigator.clipboard.writeText(result.temporaryPassword!).then(() => setCopied(true), () => setCopied(false))}
          >
            {copied ? "Copiada" : "Copiar"}
          </button>
          <span className="text-mute">No primeiro acesso, a pessoa cria a própria senha.</span>
        </div>
      )}
    </div>
  );
}

export function UsersManager({ members, myRole }: { members: Member[]; myRole: RoleName }) {
  const [addState, addAction, adding] = useActionState(addMemberAction, null);
  const [rowResult, setRowResult] = useState<UsersActionResult>(null);
  const [pending, start] = useTransition();
  const assignable = ROLES.filter((r) => r !== "OWNER" || myRole === "OWNER");
  const run = (fn: () => Promise<UsersActionResult>) => start(async () => setRowResult(await fn()));
  const label = "mb-1 mt-3 block text-[13px] text-mute";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="rounded-[14px] border border-line">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[13px] text-mute">
                <th className="border-b border-line px-3 py-2 font-medium">Pessoa</th>
                <th className="border-b border-line px-3 py-2 font-medium">Papel</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const locked = m.role === "OWNER" && myRole !== "OWNER";
                return (
                  <tr key={m.membershipId} className="align-top">
                    <td className="border-b border-line px-3 py-3">
                      <b>{m.name}</b> {m.isMe && <span className="chip ml-1">você</span>}
                      <div className="text-mute">{m.email}</div>
                      {m.pendingPassword && <span className="chip mt-1">Senha provisória</span>}
                      {!m.isMe && !locked && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            className="btn min-h-9 px-3 text-[13px]"
                            disabled={pending}
                            onClick={() => window.confirm(`Gerar nova senha provisória para ${m.name}? As sessões abertas dela serão encerradas.`) && run(() => resetPasswordAction(m.membershipId))}
                          >
                            Nova senha
                          </button>
                          <button
                            className="btn min-h-9 px-3 text-[13px] text-warn-ink"
                            disabled={pending}
                            onClick={() => window.confirm(`Remover o acesso de ${m.name} a esta organização?`) && run(() => removeMemberAction(m.membershipId))}
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="border-b border-line px-3 py-3">
                      <label className="sr-only" htmlFor={`role-${m.membershipId}`}>Papel de {m.name}</label>
                      <select
                        id={`role-${m.membershipId}`}
                        className="field min-w-[170px]"
                        value={m.role}
                        disabled={locked || pending}
                        onChange={(e) => run(() => changeRoleAction(m.membershipId, e.target.value as RoleName))}
                      >
                        {(locked ? ROLES : assignable).map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 pb-3"><Notice result={rowResult} /></div>
      </section>

      <section className="rounded-[14px] border border-line p-4">
        <h2 className="text-lg font-bold">Adicionar pessoa</h2>
        <form action={addAction}>
          <label className={label} htmlFor="name">Nome</label>
          <input className="field" id="name" name="name" required minLength={2} autoComplete="off" />
          <label className={label} htmlFor="email">E-mail</label>
          <input className="field" id="email" name="email" type="email" required autoComplete="off" />
          <label className={label} htmlFor="role">Papel</label>
          <select className="field" id="role" name="role" defaultValue="OPERATOR">
            {assignable.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]} · {ROLE_HINT[r]}</option>
            ))}
          </select>
          <button className="btn btn-primary mt-4 w-full" disabled={adding}>{adding ? "Adicionando…" : "Adicionar"}</button>
        </form>
        <Notice result={addState} />
      </section>
    </div>
  );
}
