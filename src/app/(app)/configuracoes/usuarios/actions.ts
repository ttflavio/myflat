"use server";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { getSession } from "@/server/session";
import { addMember, changeMemberRole, removeMember, resetMemberPassword } from "@/server/auth/members";

export type UsersActionResult = { ok: boolean; message: string; temporaryPassword?: string; email?: string } | null;

function fail(err: unknown): UsersActionResult {
  unstable_rethrow(err);
  if (err instanceof AppError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Erro inesperado. Tente de novo." };
}

export async function addMemberAction(_prev: UsersActionResult, form: FormData): Promise<UsersActionResult> {
  try {
    const s = await getSession();
    const email = String(form.get("email") ?? "");
    const r = await addMember(getDb(), s, { name: String(form.get("name") ?? ""), email, role: String(form.get("role") ?? "") as Role });
    refresh();
    return r.temporaryPassword
      ? { ok: true, message: "Conta criada. Repasse a senha provisória em particular; ela aparece só agora.", temporaryPassword: r.temporaryPassword, email }
      : { ok: true, message: "Essa pessoa já tinha conta e foi adicionada à organização com a senha dela." };
  } catch (err) {
    return fail(err);
  }
}

export async function changeRoleAction(membershipId: string, role: Role): Promise<UsersActionResult> {
  try {
    await changeMemberRole(getDb(), await getSession(), membershipId, role);
    refresh();
    return { ok: true, message: "Papel atualizado." };
  } catch (err) {
    return fail(err);
  }
}

export async function removeMemberAction(membershipId: string): Promise<UsersActionResult> {
  try {
    await removeMember(getDb(), await getSession(), membershipId);
    refresh();
    return { ok: true, message: "Acesso removido. As sessões dessa pessoa foram encerradas." };
  } catch (err) {
    return fail(err);
  }
}

export async function resetPasswordAction(membershipId: string): Promise<UsersActionResult> {
  try {
    const r = await resetMemberPassword(getDb(), await getSession(), membershipId);
    refresh();
    return { ok: true, message: "Nova senha provisória gerada. Ela aparece só agora.", temporaryPassword: r.temporaryPassword };
  } catch (err) {
    return fail(err);
  }
}
