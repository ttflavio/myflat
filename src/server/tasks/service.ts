// Pendências por flat. Toda gravação confere a organização e a permissão no servidor.
import { z } from "zod";
import { fromUtcDate, isIsoDate, toUtcDate } from "@/domain/availability/dates";
import { OPEN_STATUSES, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, type TaskStatusName } from "@/domain/tasks/labels";
import type { Db } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, type TenantContext } from "../tenant";

export const taskDraftSchema = z.object({
  unitId: z.string().uuid().nullable(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(TASK_CATEGORIES),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  dueDate: z.string().refine(isIsoDate, "Data no formato AAAA-MM-DD").nullable().optional(),
  dueReason: z.string().trim().max(300).nullable().optional(),
  reviewReason: z.string().trim().max(300).nullable().optional(),
});
export type TaskDraft = z.input<typeof taskDraftSchema>;

export type TaskView = {
  id: string;
  unitId: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: TaskStatusName;
  dueDate: string | null;
  dueReason: string | null;
  reviewReason: string | null;
  source: string;
  sourceText: string | null;
  createdAt: string;
};

async function assertUnits(db: Db, ctx: TenantContext, unitIds: (string | null | undefined)[]) {
  const ids = [...new Set(unitIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const found = await db.unit.count({ where: { organizationId: ctx.organizationId, id: { in: ids } } });
  if (found !== ids.length) throw new NotFoundError("Imóvel");
}

/**
 * Grava pendências. Sem flat ou com algo a revisar → status "A revisar" (triagem);
 * com flat e sem dúvida → "A fazer", direto na lista do flat.
 */
export async function createTasks(
  db: Db,
  ctx: TenantContext,
  drafts: TaskDraft[],
  origin: { source: "MANUAL" | "QUICK_CAPTURE" | "AI"; sourceText?: string | null },
) {
  assertCan(ctx, "task:write");
  const parsed = drafts.map((d) => {
    const r = taskDraftSchema.safeParse(d);
    if (!r.success) throw new ValidationError("Pendência inválida.", r.error.issues);
    return r.data;
  });
  await assertUnits(db, ctx, parsed.map((d) => d.unitId));
  return db.$transaction(async (tx) => {
    const created = [];
    for (const d of parsed) {
      const status: TaskStatusName = !d.unitId || d.reviewReason ? "INBOX" : "TODO";
      const t = await tx.task.create({
        data: {
          organizationId: ctx.organizationId,
          unitId: d.unitId,
          title: d.title,
          description: d.description ?? null,
          category: d.category,
          priority: d.priority,
          status,
          dueDate: d.dueDate ? toUtcDate(d.dueDate) : null,
          dueReason: d.dueReason ?? null,
          reviewReason: d.reviewReason ?? null,
          source: origin.source,
          sourceText: origin.sourceText?.slice(0, 4000) ?? null,
          createdById: ctx.userId,
        },
      });
      created.push(t);
    }
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        entity: "task",
        entityId: created[0]?.id ?? "-",
        action: "tasks_created",
        data: { count: created.length, source: origin.source },
      },
    });
    return created;
  });
}

export async function listTasks(db: Db, ctx: TenantContext, opts: { includeClosed?: boolean } = {}): Promise<TaskView[]> {
  assertCan(ctx, "task:read");
  const rows = await db.task.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.includeClosed ? {} : { status: { in: OPEN_STATUSES } }) },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return rows.map((t) => ({
    id: t.id,
    unitId: t.unitId,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? fromUtcDate(t.dueDate) : null,
    dueReason: t.dueReason,
    reviewReason: t.reviewReason,
    source: t.source,
    sourceText: t.sourceText,
    createdAt: t.createdAt.toISOString(),
  }));
}

async function findTask(db: Db, ctx: TenantContext, id: string) {
  const t = await db.task.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!t) throw new NotFoundError("Pendência");
  return t;
}

export async function updateTaskStatus(db: Db, ctx: TenantContext, id: string, status: TaskStatusName) {
  assertCan(ctx, "task:write");
  if (!TASK_STATUSES.includes(status)) throw new ValidationError("Status inválido.");
  const t = await findTask(db, ctx, id);
  if (status !== "INBOX" && !t.unitId) throw new ValidationError("Escolha o flat antes de tirar a pendência da triagem.");
  return db.task.update({
    where: { id: t.id },
    data: { status, completedAt: status === "DONE" ? new Date() : null, ...(status !== "INBOX" ? { reviewReason: null } : {}) },
  });
}

/** Define (ou troca) o flat de uma pendência e a tira da triagem. */
export async function assignTaskUnit(db: Db, ctx: TenantContext, id: string, unitId: string) {
  assertCan(ctx, "task:write");
  const t = await findTask(db, ctx, id);
  await assertUnits(db, ctx, [unitId]);
  return db.task.update({ where: { id: t.id }, data: { unitId, status: t.status === "INBOX" ? "TODO" : t.status, reviewReason: null } });
}
