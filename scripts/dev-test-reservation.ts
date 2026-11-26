// DESENVOLVIMENTO: cria (create) ou apaga (delete) uma reserva de teste marcada "TESTE".
//   npx tsx scripts/dev-test-reservation.ts create | delete
import "dotenv/config";
import { createDb } from "../src/server/db";
import { createReservation } from "../src/server/reservations/service";
import { addDays, todayIn } from "../src/domain/availability/dates";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Só para desenvolvimento.");
  const db = createDb(process.env.DATABASE_URL!);
  const mode = process.argv[2];
  if (mode === "create") {
    const m = await db.membership.findFirstOrThrow({ where: { role: "OWNER", user: { email: "admin@myflat.local" } } });
    const unit = await db.unit.findFirstOrThrow({ where: { organizationId: m.organizationId, code: "204" } });
    const t = todayIn();
    const r = await createReservation(db, { organizationId: m.organizationId, userId: m.userId, role: "OWNER" }, {
      unitId: unit.id, channel: "AIRBNB", checkIn: addDays(t, 3), checkOut: addDays(t, 6), guest: { name: "TESTE Hóspede" }, totalAmount: 900, channelFee: 135, notes: "TESTE",
    });
    console.log("criada", r.code);
  } else if (mode === "delete") {
    const rs = await db.reservation.findMany({ where: { notes: "TESTE" }, select: { id: true, guestId: true } });
    const ids = rs.map((r) => r.id);
    const occIds = (await db.occupancy.findMany({ where: { reservationId: { in: ids } }, select: { id: true } })).map((o) => o.id);
    await db.availabilityEvent.deleteMany({ where: { occupancyId: { in: occIds } } });
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await db.occupancy.deleteMany({ where: { reservationId: { in: ids } } });
    await db.reservation.deleteMany({ where: { id: { in: ids } } });
    await db.guest.deleteMany({ where: { id: { in: rs.map((r) => r.guestId).filter((x): x is string => !!x) } } });
    console.log("apagadas", ids.length);
  }
  await db.$disconnect();
}
main();
