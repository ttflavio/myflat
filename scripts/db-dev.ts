// npm run db:start  → sobe o banco de desenvolvimento em .pgdata/ (porta do DATABASE_URL).
// Deixe o terminal aberto; Ctrl+C desliga o banco.
import "dotenv/config";
import { startEmbeddedDb } from "./embedded-db";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://postgres:myflat-local@localhost:54329/myflat");
  const { pg, fresh } = await startEmbeddedDb({
    dir: ".pgdata",
    port: Number(url.port || 54329),
    database: url.pathname.slice(1) || "myflat",
    password: decodeURIComponent(url.password || "myflat-local"),
    persistent: true,
  });

  console.log(`PostgreSQL local rodando em localhost:${url.port}${fresh ? " (criado agora)" : ""}.`);
  console.log("Próximos passos: npm run db:migrate e npm run db:seed. Ctrl+C para desligar.");

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
