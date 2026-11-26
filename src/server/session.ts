// Sessão da requisição → TenantContext. Única porta de entrada das páginas e ações.
import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { validateSessionToken, type ValidSession } from "./auth/sessions";

export const SESSION_COOKIE = "mf_session";

export type Session = ValidSession;

/** Sessão atual ou null (sem redirecionar). */
export async function readSession(): Promise<Session | null> {
  await connection(); // sessão é sempre da requisição, nunca da pré-renderização
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSessionToken(getDb(), token);
}

/**
 * Sessão obrigatória: sem login vai para /login; com senha provisória vai trocar a senha.
 * Use em páginas e em Server Actions (que também são endpoints públicos).
 */
export async function getSession(opts: { allowPasswordChange?: boolean } = {}): Promise<Session> {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword && !opts.allowPasswordChange) redirect("/conta?primeiro-acesso=1");
  return session;
}
