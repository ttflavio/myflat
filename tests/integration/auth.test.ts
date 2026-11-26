import { afterAll, describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { login, MAX_FAILURES } from "@/server/auth/login";
import { createSession, validateSessionToken } from "@/server/auth/sessions";
import { addMember, changeMemberRole, changeOwnPassword, removeMember, resetMemberPassword } from "@/server/auth/members";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { makeOrg, testDb } from "../setup/factory";

const db = testDb();
afterAll(() => db.$disconnect());

const PW = "senha-de-teste-longa";

async function withPassword(userId: string, pw = PW) {
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } });
}

describe("senhas", () => {
  it("gera hash diferente a cada vez e confere", async () => {
    const a = await hashPassword(PW);
    const b = await hashPassword(PW);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword("outra-senha-qualquer", a)).toBe(false);
    expect(await verifyPassword(PW, null)).toBe(false);
  });
  it("recusa senhas fracas", () => {
    expect(passwordProblem("curta")).toMatch(/10/);
    expect(passwordProblem("aaaaaaaaaaaa")).not.toBeNull();
    expect(passwordProblem("maria12345678", "maria@x.com")).not.toBeNull();
    expect(passwordProblem("praia-de-tambau-2026")).toBeNull();
  });
});

describe("login e sessões", () => {
  it("entra com a senha certa e a sessão carrega organização e papel", async () => {
    const { user, ctx } = await makeOrg(db);
    await withPassword(user.id);
    const r = await login(db, user.email.toUpperCase(), PW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await validateSessionToken(db, r.token);
    expect(s?.organizationId).toBe(ctx.organizationId);
    expect(s?.role).toBe("ADMIN");
    expect(await db.session.count({ where: { tokenHash: r.token } })).toBe(0); // token não fica salvo em texto
  });

  it("mesma resposta para e-mail inexistente e senha errada", async () => {
    const { user } = await makeOrg(db);
    await withPassword(user.id);
    expect(await login(db, user.email, "senha-errada-123")).toEqual({ ok: false, reason: "invalid" });
    expect(await login(db, "ninguem@example.test", PW)).toEqual({ ok: false, reason: "invalid" });
  });

  it(`bloqueia após ${MAX_FAILURES} erros, mesmo com a senha certa`, async () => {
    const { user } = await makeOrg(db);
    await withPassword(user.id);
    for (let i = 0; i < MAX_FAILURES; i++) await login(db, user.email, "senha-errada-123");
    expect(await login(db, user.email, PW)).toEqual({ ok: false, reason: "locked" });
    // depois da janela, volta a funcionar
    const later = new Date(Date.now() + 16 * 60_000);
    expect((await login(db, user.email, PW, null, later)).ok).toBe(true);
  });

  it("sessão vencida, revogada, de usuário desativado ou de quem saiu da organização não vale", async () => {
    const { user, ctx } = await makeOrg(db);
    const expired = await createSession(db, user.id, ctx.organizationId, null, new Date(Date.now() - 31 * 86_400_000));
    expect(await validateSessionToken(db, expired.token)).toBeNull();

    const live = await createSession(db, user.id, ctx.organizationId);
    expect(await validateSessionToken(db, live.token)).not.toBeNull();
    await db.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    expect(await validateSessionToken(db, live.token)).toBeNull();
    await db.user.update({ where: { id: user.id }, data: { disabledAt: null } });

    await db.membership.deleteMany({ where: { userId: user.id } });
    expect(await validateSessionToken(db, live.token)).toBeNull();
    expect(await validateSessionToken(db, "token-inventado")).toBeNull();
  });
});

describe("membros e papéis", () => {
  it("dono adiciona pessoa nova com senha provisória que obriga a troca", async () => {
    const { ctx } = await makeOrg(db, { role: "OWNER" });
    const r = await addMember(db, ctx, { name: "Diarista", email: `d-${Date.now()}@example.test`, role: "CLEANING" });
    expect(r.temporaryPassword).toHaveLength(14);
    const m = await db.membership.findUnique({ where: { id: r.membershipId }, include: { user: true } });
    expect(m?.user.mustChangePassword).toBe(true);
    expect(await verifyPassword(r.temporaryPassword!, m?.user.passwordHash)).toBe(true);
    await expect(addMember(db, ctx, { name: "Diarista", email: m!.user.email, role: "CLEANING" })).rejects.toBeInstanceOf(AppError);
  });

  it("administração não cria nem mexe em donos; operação não gerencia ninguém", async () => {
    const admin = await makeOrg(db, { role: "ADMIN" });
    await expect(addMember(db, admin.ctx, { name: "Xis", email: `x-${Date.now()}@example.test`, role: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
    const op = await makeOrg(db, { role: "OPERATOR" });
    await expect(addMember(db, op.ctx, { name: "Ypsilon", email: `y-${Date.now()}@example.test`, role: "CLEANING" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a organização nunca fica sem dono", async () => {
    const { ctx } = await makeOrg(db, { role: "OWNER" });
    const mine = await db.membership.findFirstOrThrow({ where: { organizationId: ctx.organizationId, userId: ctx.userId } });
    await expect(changeMemberRole(db, ctx, mine.id, "ADMIN")).rejects.toThrow(/pelo menos um dono/);
    await expect(removeMember(db, ctx, mine.id)).rejects.toThrow(/pelo menos um dono/);
  });

  it("remover derruba as sessões; não dá para mexer em membro de outra organização", async () => {
    const a = await makeOrg(db, { role: "OWNER" });
    const b = await makeOrg(db, { role: "OWNER" });
    const added = await addMember(db, a.ctx, { name: "Recepção", email: `r-${Date.now()}@example.test`, role: "OPERATOR" });
    const m = await db.membership.findUniqueOrThrow({ where: { id: added.membershipId } });
    const s = await createSession(db, m.userId, a.ctx.organizationId);
    await expect(removeMember(db, b.ctx, added.membershipId)).rejects.toBeInstanceOf(NotFoundError);
    await removeMember(db, a.ctx, added.membershipId);
    expect(await validateSessionToken(db, s.token)).toBeNull();
  });

  it("nova senha provisória encerra as sessões da pessoa", async () => {
    const { ctx } = await makeOrg(db, { role: "OWNER" });
    const added = await addMember(db, ctx, { name: "Financeiro", email: `f-${Date.now()}@example.test`, role: "FINANCE" });
    const m = await db.membership.findUniqueOrThrow({ where: { id: added.membershipId } });
    const s = await createSession(db, m.userId, ctx.organizationId);
    const { temporaryPassword } = await resetMemberPassword(db, ctx, added.membershipId);
    expect(temporaryPassword).not.toBe(added.temporaryPassword);
    expect(await validateSessionToken(db, s.token)).toBeNull();
  });

  it("trocar a própria senha exige a atual e encerra as outras sessões", async () => {
    const { user, ctx } = await makeOrg(db);
    await withPassword(user.id);
    const keep = await createSession(db, user.id, ctx.organizationId);
    const other = await createSession(db, user.id, ctx.organizationId);
    const session = (await validateSessionToken(db, keep.token))!;
    await expect(changeOwnPassword(db, session, "errada-errada-1", "nova-senha-segura-1")).rejects.toBeInstanceOf(ValidationError);
    await expect(changeOwnPassword(db, session, PW, "curta")).rejects.toBeInstanceOf(ValidationError);
    await changeOwnPassword(db, session, PW, "nova-senha-segura-1");
    expect(await validateSessionToken(db, keep.token)).not.toBeNull();
    expect(await validateSessionToken(db, other.token)).toBeNull();
    expect((await login(db, user.email, "nova-senha-segura-1")).ok).toBe(true);
  });
});
