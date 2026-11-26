// PostgreSQL embutido para desenvolvimento e testes, sem Docker nem instalação.
// Usa os binários oficiais do pacote embedded-postgres (inclui btree_gist).
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

export type EmbeddedDbOptions = {
  dir: string;
  port: number;
  database: string;
  persistent: boolean;
  password: string;
};

export async function startEmbeddedDb(opts: EmbeddedDbOptions) {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    user: "postgres",
    password: opts.password,
    port: opts.port,
    persistent: opts.persistent,
    onLog: () => {},
  });
  const fresh = !existsSync(`${opts.dir}/PG_VERSION`);
  if (fresh) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(opts.database);
  } catch {
    // já existe
  }
  const url = `postgresql://postgres:${encodeURIComponent(opts.password)}@localhost:${opts.port}/${opts.database}`;
  return { pg, url, fresh };
}
