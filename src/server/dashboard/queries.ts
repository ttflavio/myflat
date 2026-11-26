// Dados do painel do dia, lidos do banco e calculados no domínio.
import { addDays, diffDays, fromUtcDate, toUtcDate, type IsoDate } from "@/domain/availability/dates";
import {
  checkInsOn,
  checkOutsOn,
  monthFigures,
  monthRange,
  unitStateTonight,
  upcomingCheckIns,
  type DayOccupancy,
} from "@/domain/dashboard/day";
import type { Db } from "../db";
import { listTasks, type TaskView } from "../tasks/service";
import { assertCan, can, type TenantContext } from "../tenant";
import { listProperties } from "../units/service";

export type DashboardData = {
  today: IsoDate;
  units: { id: string; code: string; building: string; state: "occupied" | "blocked" | "free"; missing: string[] }[];
  checkIns: DayOccupancy[];
  checkOuts: DayOccupancy[];
  blockedToday: DayOccupancy[];
  upcoming: DayOccupancy[];
  tasks: { open: number; overdue: TaskView[]; dueToday: TaskView[]; urgent: TaskView[]; triage: number };
  month: ReturnType<typeof monthFigures> & { label: string } | null;
  reservationsTotal: number;
};

export async function getDashboard(db: Db, ctx: TenantContext, today: IsoDate): Promise<DashboardData> {
  assertCan(ctx, "reservation:read");
  const { start, end } = monthRange(today);
  const windowStart = start < today ? start : today;
  const windowEnd = addDays(today, 8) > end ? addDays(today, 8) : end;

  const [{ units }, occRows, tasks, reservationsTotal] = await Promise.all([
    listProperties(db, ctx),
    db.occupancy.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        checkIn: { lt: toUtcDate(windowEnd) },
        checkOut: { gt: toUtcDate(windowStart) },
      },
      include: { reservation: { include: { guest: { select: { name: true } } } } },
    }),
    can(ctx, "task:read") ? listTasks(db, ctx) : Promise.resolve([] as TaskView[]),
    db.reservation.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  const occ: DayOccupancy[] = occRows.map((o) => ({
    id: o.id,
    unitId: o.unitId,
    kind: o.kind,
    checkIn: fromUtcDate(o.checkIn),
    checkOut: fromUtcDate(o.checkOut),
    status: o.reservation?.status ?? null,
    guestName: o.reservation?.guest?.name ?? null,
    channel: o.reservation?.channel ?? o.source,
    netAmount: o.reservation ? Number(o.reservation.netAmount) : null,
    blockReason: o.blockReason,
  }));

  const showFinance = can(ctx, "finance:read");
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(toUtcDate(today));

  return {
    today,
    units: units.map((u) => ({ id: u.id, code: u.code, building: u.propertyName, state: unitStateTonight(u.id, occ, today), missing: u.missing })),
    checkIns: checkInsOn(occ, today),
    checkOuts: checkOutsOn(occ, today),
    blockedToday: occ.filter((o) => o.kind === "BLOCK" && o.checkIn <= today && today < o.checkOut),
    upcoming: upcomingCheckIns(occ, today, 7),
    tasks: {
      open: tasks.length,
      overdue: tasks.filter((t) => t.dueDate && diffDays(today, t.dueDate) < 0),
      dueToday: tasks.filter((t) => t.dueDate === today),
      urgent: tasks.filter((t) => t.priority === "URGENT" && !(t.dueDate && diffDays(today, t.dueDate) <= 0)),
      triage: tasks.filter((t) => !t.unitId).length,
    },
    month: showFinance ? { ...monthFigures(occ, units.length, today), label: monthName } : null,
    reservationsTotal,
  };
}
