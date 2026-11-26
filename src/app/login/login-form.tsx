"use client";

import { useActionState } from "react";
import { loginAction } from "../auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action}>
      <label className="mb-1 mt-3 block text-[13px] text-mute" htmlFor="email">E-mail</label>
      <input
        className="field"
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus={!state?.email}
        defaultValue={state?.email ?? ""}
        key={state?.email ?? "novo"}
      />
      <label className="mb-1 mt-3 block text-[13px] text-mute" htmlFor="password">Senha</label>
      <input className="field" id="password" name="password" type="password" autoComplete="current-password" required autoFocus={!!state?.email} />
      {state && !state.ok && (
        <p role="alert" className="mt-3 rounded-[10px] border border-warn bg-warn-bg p-3 text-sm text-warn-ink">
          {state.message}
        </p>
      )}
      <button className="btn btn-primary mt-5 w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
