// Sobe um PostgreSQL descartável para os testes (pasta .pgtest/, porta 54339),
// aplica as migrations reais e entrega a URL aos testes via inject("databaseUrl").
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import type { TestProject } from "vitest/node";
import { startEmbeddedDb } from "../../scripts/embedded-db";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const dir = ".pgtest";
  rmSync(dir, { recursive: true, force: true });
  const { pg, url } = await startEmbeddedDb({ dir, port: 54339, database: "myflat_test", password: "test", persistent: false });
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  project.provide("databaseUrl", url);
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
