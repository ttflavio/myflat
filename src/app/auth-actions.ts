"use server";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { login, MAX_FAILURES, WINDOW_MINUTES } from "@/server/auth/login";
import { changeOwnPassword } from "@/server/auth/members";
import { revokeSessionToken } from "@/server/auth/sessions";
import { getSession, SESSION_COOKIE } from "@/server/session";

export type FormState = { ok: boolean; message: string; email?: string } | null;

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Informe e-mail e senha." };
  const ua = (await headers()).get("user-agent");
  const result = await login(getDb(), email, password, ua);
  if (!result.ok) {
    const message =
      result.reason === "locked"
        ? `Muitas tentativas. Espere ${WINDOW_MINUTES} minutos e tente de novo.`
        : result.reason === "no_organization"
          ? "Sua conta ainda não está ligada a nenhuma organização."
          : `E-mail ou senha incorretos. Depois de ${MAX_FAILURES} erros o acesso fica bloqueado por ${WINDOW_MINUTES} minutos.`;
    return { ok: false, message, email };
  }
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: result.expiresAt,
  });
  redirect(result.mustChangePassword ? "/conta?primeiro-acesso=1" : "/painel");
}

export async function logoutAction() {
  const jar = await cookies();
  await revokeSessionToken(getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const session = await getSession({ allowPasswordChange: true });
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) return { ok: false, message: "A confirmação não é igual à nova senha." };
    await changeOwnPassword(getDb(), session, String(form.get("current") ?? ""), next);
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: "Erro inesperado. Tente de novo." };
  }
  redirect("/painel");
}
