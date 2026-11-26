// Sessões no banco. O token só existe no cookie do navegador; no banco fica o SHA-256.
// Revogar = marcar revoked_at (logout, troca de senha, remoção do membro).
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db";
import type { TenantContext } from "../tenant";

export const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(db: Db, userId: string, organizationId: string, userAgent?: string | null, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, organizationId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt };
}

export type ValidSession = TenantContext & {
  sessionId: string;
  organizationName: string;
  userName: string;
  userEmail: string;
  mustChangePassword: boolean;
};

/**
 * Valida o token e confirma, no mesmo passo, que a pessoa ainda é membro da organização
 * e não está desativada. Qualquer falha devolve null (o chamador manda para o login).
 */
export async function validateSessionToken(db: Db, token: string | undefined, now = new Date()): Promise<ValidSession | null> {
  if (!token || token.length > 100) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s || s.revokedAt || s.expiresAt <= now || s.user.disabledAt) return null;
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId: s.organizationId, userId: s.userId } },
    include: { organization: { select: { name: true } } },
  });
  if (!membership) return null;
  return {
    sessionId: s.id,
    organizationId: s.organizationId,
    userId: s.userId,
    role: membership.role,
    organizationName: membership.organization.name,
    userName: s.user.name,
    userEmail: s.user.email,
    mustChangePassword: s.user.mustChangePassword,
  };
}

export async function revokeSessionToken(db: Db, token: string | undefined) {
  if (!token) return;
  await db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(db: Db, userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
