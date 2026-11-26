// Apaga do banco de DESENVOLVIMENTO as pendências criadas em testes manuais (título começando com "TESTE:").
import "dotenv/config";
import { createDb } from "../src/server/db";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Só para desenvolvimento.");
  const db = createDb(process.env.DATABASE_URL!);
  const tasks = await db.task.findMany({ where: { title: { startsWith: "TESTE:" } }, select: { id: true } });
  const ids = tasks.map((t) => t.id);
  const logs = await db.auditLog.deleteMany({ where: { entity: "task", entityId: { in: ids } } });
  const removed = await db.task.deleteMany({ where: { id: { in: ids } } });
  console.log(`Pendências de teste apagadas: ${removed.count} (registros de auditoria: ${logs.count}).`);
  await db.$disconnect();
}
main();
