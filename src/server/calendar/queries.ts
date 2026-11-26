// Leitura do calendário: flats da organização + ocupações ativas na janela.
// Devolve só dados simples (serializáveis) para a interface.
import { addDays, fromUtcDate, toUtcDate, type IsoDate } from "@/domain/availability/dates";
import type { Db } from "../db";
import { assertCan, type TenantContext } from "../tenant";

export type CalendarUnit = { id: string; code: string; name: string; propertyName: string; maxGuests: number | null };

export type CalendarItem = {
  occupancyId: string;
  unitId: string;
  kind: "RESERVATION" | "BLOCK" | "EXTERNAL";
  checkIn: IsoDate;
  checkOut: IsoDate;
  source: string;
  note: string | null;
  blockReason: string | null;
  reservation: null | {
    id: string;
    code: string;
    status: string;
    channel: string;
    guestName: string | null;
    guestCount: number;
    totalAmount: string;
    netAmount: string;
    holdExpiresAt: string | null;
  };
};

export type CalendarData = { start: IsoDate; days: number; units: CalendarUnit[]; items: CalendarItem[] };

export async function getCalendar(db: Db, ctx: TenantContext, start: IsoDate, days: number): Promise<CalendarData> {
  assertCan(ctx, "reservation:read");
  const end = addDays(start, days);
  const [units, occupancies] = await Promise.all([
    db.unit.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      include: { property: { select: { name: true } } },
      orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    }),
    db.occupancy.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        checkIn: { lt: toUtcDate(end) },
        checkOut: { gt: toUtcDate(start) },
      },
      include: { reservation: { include: { guest: { select: { name: true } } } } },
      orderBy: { checkIn: "asc" },
    }),
  ]);

  return {
    start,
    days,
    units: units.map((u) => ({ id: u.id, code: u.code, name: u.name, propertyName: u.property.name, maxGuests: u.maxGuests })),
    items: occupancies.map((o) => ({
      occupancyId: o.id,
      unitId: o.unitId,
      kind: o.kind,
      checkIn: fromUtcDate(o.checkIn),
      checkOut: fromUtcDate(o.checkOut),
      source: o.source,
      note: o.note,
      blockReason: o.blockReason,
      reservation: o.reservation && {
        id: o.reservation.id,
        code: o.reservation.code,
        status: o.reservation.status,
        channel: o.reservation.channel,
        guestName: o.reservation.guest?.name ?? null,
        guestCount: o.reservation.guestCount,
        totalAmount: o.reservation.totalAmount.toFixed(2),
        netAmount: o.reservation.netAmount.toFixed(2),
        holdExpiresAt: o.reservation.holdExpiresAt?.toISOString() ?? null,
      },
    })),
  };
}
