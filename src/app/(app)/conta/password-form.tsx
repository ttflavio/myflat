"use client";

import { useActionState } from "react";
import { changePasswordAction } from "../../auth-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const label = "mb-1 mt-3 block text-[13px] text-mute";
  return (
    <form action={action} className="max-w-[480px]">
      <label className={label} htmlFor="current">Senha atual</label>
      <input className="field" id="current" name="current" type="password" autoComplete="current-password" required />
      <label className={label} htmlFor="next">Nova senha</label>
      <input className="field" id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
      <label className={label} htmlFor="confirm">Confirme a nova senha</label>
      <input className="field" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      {state && !state.ok && (
        <p role="alert" className="mt-3 rounded-[10px] border border-warn bg-warn-bg p-3 text-sm text-warn-ink">{state.message}</p>
      )}
      <button className="btn btn-primary mt-4" disabled={pending}>{pending ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}
