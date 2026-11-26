// Login por e-mail e senha, com limite de tentativas por e-mail.
import type { Db } from "../db";
import { dummyHash, verifyPassword } from "./password";
import { createSession } from "./sessions";

export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" | "locked" | "no_organization" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function login(db: Db, rawEmail: string, password: string, userAgent?: string | null, now = new Date()): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { email, success: true, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
  const failures = await db.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: lastSuccess?.createdAt ?? since } },
  });
  if (failures >= MAX_FAILURES) return { ok: false, reason: "locked" };

  const user = await db.user.findUnique({ where: { email } });
  // Mesmo sem usuário, compara um hash para não revelar quais e-mails existem pelo tempo de resposta.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !valid || user.disabledAt) {
    await db.loginAttempt.create({ data: { email, success: false, createdAt: now } });
    return { ok: false, reason: "invalid" };
  }

  const membership = await db.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, reason: "no_organization" };

  await db.loginAttempt.create({ data: { email, success: true, createdAt: now } });
  const { token, expiresAt } = await createSession(db, user.id, membership.organizationId, userAgent, now);
  return { ok: true, token, expiresAt, mustChangePassword: user.mustChangePassword };
}
