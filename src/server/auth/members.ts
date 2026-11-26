// Gestão de membros da organização (usuários e papéis) e troca de senha.
// Regras: só dono ou administrador gerencia; só o dono mexe em donos;
// a organização nunca fica sem dono; remover ou resetar derruba as sessões da pessoa.
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import type { Db } from "../db";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { assertCan, type TenantContext } from "../tenant";
import { normalizeEmail } from "./login";
import { generateTemporaryPassword, hashPassword, passwordProblem, verifyPassword } from "./password";
import { revokeAllSessions } from "./sessions";

export { ROLES, ROLE_LABEL } from "@/domain/auth/roles";
import { ROLES } from "@/domain/auth/roles";

async function audit(db: Db, ctx: TenantContext, entityId: string, action: string, data: object) {
  await db.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.userId, entity: "membership", entityId, action, data } });
}

function assertCanTouchOwner(ctx: TenantContext, role: Role) {
  if (role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError("gerenciar donos da organização");
}

async function ownerCount(db: Db, organizationId: string) {
  return db.membership.count({ where: { organizationId, role: "OWNER" } });
}

async function findMembership(db: Db, ctx: TenantContext, membershipId: string) {
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId: ctx.organizationId }, include: { user: true } });
  if (!m) throw new NotFoundError("Membro");
  return m;
}

export async function listMembers(db: Db, ctx: TenantContext) {
  assertCan(ctx, "settings:write");
  const rows = await db.membership.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: { select: { id: true, name: true, email: true, disabledAt: true, mustChangePassword: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    pendingPassword: m.user.mustChangePassword,
    isMe: m.user.id === ctx.userId,
  }));
}

export const addMemberInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  role: z.enum(["OWNER", "ADMIN", "OPERATOR", "CLEANING", "FINANCE", "PROPERTY_OWNER"]),
});

/** Adiciona alguém. Se o e-mail é novo, cria a conta com senha provisória (devolvida uma única vez). */
export async function addMember(db: Db, ctx: TenantContext, raw: z.input<typeof addMemberInput>) {
  assertCan(ctx, "settings:write");
  const parsed = addMemberInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Confira nome, e-mail e papel.", parsed.error.issues);
  const input = { ...parsed.data, email: normalizeEmail(parsed.data.email) };
  assertCanTouchOwner(ctx, input.role);

  let user = await db.user.findUnique({ where: { email: input.email } });
  let temporaryPassword: string | null = null;
  if (!user) {
    temporaryPassword = generateTemporaryPassword();
    user = await db.user.create({
      data: { email: input.email, name: input.name, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
    });
  }
  const exists = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: user.id } } });
  if (exists) throw new AppError("conflict", "Essa pessoa já faz parte da organização.");
  const m = await db.membership.create({ data: { organizationId: ctx.organizationId, userId: user.id, role: input.role } });
  await audit(db, ctx, m.id, "member_added", { email: input.email, role: input.role, newAccount: !!temporaryPassword });
  return { membershipId: m.id, temporaryPassword };
}

export async function changeMemberRole(db: Db, ctx: TenantContext, membershipId: string, role: Role) {
  assertCan(ctx, "settings:write");
  if (!ROLES.includes(role)) throw new ValidationError("Papel inválido.");
  const m = await findMembership(db, ctx, membershipId);
  assertCanTouchOwner(ctx, m.role);
  assertCanTouchOwner(ctx, role);
  if (m.role === "OWNER" && role !== "OWNER" && (await ownerCount(db, ctx.organizationId)) <= 1) {
    throw new AppError("last_owner", "A organização precisa de pelo menos um dono.");
  }
  await db.membership.update({ where: { id: m.id }, data: { role } });
  await audit(db, ctx, m.id, "role_changed", { from: m.role, to: role });
}

export async function removeMember(db: Db, ctx: TenantContext, membershipId: string) {
  assertCan(ctx, "settings:write");
  const m = await findMembership(db, ctx, membershipId);
  assertCanTouchOwner(ctx, m.role);
  if (m.role === "OWNER" && (await ownerCount(db, ctx.organizationId)) <= 1) {
    throw new AppError("last_owner", "A organização precisa de pelo menos um dono.");
  }
  await db.$transaction([
    db.membership.delete({ where: { id: m.id } }),
    db.session.updateMany({ where: { userId: m.userId, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(db, ctx, m.id, "member_removed", { email: m.user.email, role: m.role });
}

/** Gera nova senha provisória e derruba as sessões da pessoa. */
export async function resetMemberPassword(db: Db, ctx: TenantContext, membershipId: string) {
  assertCan(ctx, "settings:write");
  const m = await findMembership(db, ctx, membershipId);
  assertCanTouchOwner(ctx, m.role);
  if (m.userId === ctx.userId) throw new ValidationError("Para a sua própria senha, use Minha conta.");
  const temporaryPassword = generateTemporaryPassword();
  await db.user.update({ where: { id: m.userId }, data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true } });
  await revokeAllSessions(db, m.userId);
  await audit(db, ctx, m.id, "password_reset", { email: m.user.email });
  return { temporaryPassword };
}

export async function changeOwnPassword(
  db: Db,
  ctx: TenantContext & { sessionId: string },
  current: string,
  next: string,
) {
  const user = await db.user.findUnique({ where: { id: ctx.userId } });
  if (!user) throw new NotFoundError("Usuário");
  if (!(await verifyPassword(current, user.passwordHash))) throw new ValidationError("A senha atual não confere.");
  const problem = passwordProblem(next, user.email);
  if (problem) throw new ValidationError(problem);
  if (current === next) throw new ValidationError("A nova senha precisa ser diferente da atual.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await revokeAllSessions(db, user.id, ctx.sessionId);
  await db.auditLog.create({
    data: { organizationId: ctx.organizationId, actorUserId: ctx.userId, entity: "user", entityId: user.id, action: "password_changed" },
  });
}
