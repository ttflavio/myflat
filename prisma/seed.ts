// Seed de DESENVOLVIMENTO (npm run db:seed). Nunca rodar em produção.
// Usa os mesmos dados iniciais da produção (prisma/initial-data.ts) e cria o usuário de teste
// admin@myflat.local com a senha SEED_ADMIN_PASSWORD do .env. Idempotente.
import "dotenv/config";
import { createDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { ensureOrganization } from "./initial-data";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed de desenvolvimento não roda em produção.");
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 10) throw new Error("Defina SEED_ADMIN_PASSWORD (10+ caracteres) no .env antes do seed.");
  const db = createDb(process.env.DATABASE_URL!);

  const { org, buildings, flats } = await ensureOrganization(db);
  const admin = await db.user.upsert({
    where: { email: "admin@myflat.local" },
    update: {},
    create: { email: "admin@myflat.local", name: "Administração", passwordHash: await hashPassword(password) },
  });
  await db.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    update: {},
    create: { organizationId: org.id, userId: admin.id, role: "OWNER" },
  });

  console.log(`Seed aplicado: organização, 1 usuário de administração, ${buildings} prédios e ${flats} flats. Sem reservas.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
