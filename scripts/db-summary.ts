// npx tsx scripts/db-summary.ts → mostra o que existe no banco (sem dados sensíveis).
import "dotenv/config";
import { createDb } from "../src/server/db";

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const units = await db.unit.findMany({ include: { property: true }, orderBy: [{ property: { name: "asc" } }, { code: "asc" }] });
  console.log("Organizações:", await db.organization.count());
  console.log("Usuários:", (await db.user.findMany({ select: { email: true } })).map((u) => u.email).join(", "));
  console.log("Flats:", units.map((u) => `${u.property.name} ${u.code}${u.ownedByManager ? " (próprio)" : ""}`).join(" | "));
  console.log("Reservas:", await db.reservation.count(), "· Ocupações:", await db.occupancy.count(), "· Tarefas:", await db.task.count());
  await db.$disconnect();
}
main();
