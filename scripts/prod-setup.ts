// Preparação do banco de PRODUÇÃO, rodada uma vez por quem administra o sistema:
//   npx tsx scripts/prod-setup.ts voce@email.com "Seu nome"
// Usa PROD_DIRECT_URL do .env (ou DATABASE_URL, se PROD_DIRECT_URL não existir).
import "dotenv/config";
// 1) cria a organização, os prédios e os 6 flats (sem dados inventados);
// 2) cria a conta de dona da organização com senha PROVISÓRIA, mostrada só neste terminal.
// A pessoa troca a senha no primeiro acesso. Rodar de novo não duplica nada.
import { createDb } from "../src/server/db";
import { generateTemporaryPassword, hashPassword } from "../src/server/auth/password";
import { normalizeEmail } from "../src/server/auth/login";
import { ensureOrganization } from "../prisma/initial-data";

async function main() {
  const url = process.env.PROD_DIRECT_URL || process.env.DATABASE_URL;
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  if (!url) throw new Error("Defina DATABASE_URL com a URL do banco de produção.");
  if (!rawEmail || !rawEmail.includes("@")) throw new Error('Uso: npx tsx scripts/prod-setup.ts voce@email.com "Seu nome"');
  const email = normalizeEmail(rawEmail);
  const name = nameParts.join(" ").trim() || "Administração";
  console.log(`Banco: ${new URL(url).host}`);
  const db = createDb(url);

  const { org, buildings, flats } = await ensureOrganization(db);
  console.log(`Organização pronta: ${buildings} prédios e ${flats} flats.`);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A conta ${email} já existe; a senha não foi alterada.`);
    await db.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: existing.id } },
      update: {},
      create: { organizationId: org.id, userId: existing.id, role: "OWNER" },
    });
  } else {
    const temporary = generateTemporaryPassword();
    const user = await db.user.create({
      data: { email, name, passwordHash: await hashPassword(temporary), mustChangePassword: true },
    });
    await db.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    console.log("");
    console.log(`Conta criada: ${email}`);
    console.log(`Senha provisória (aparece só agora; troque no primeiro acesso): ${temporary}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
