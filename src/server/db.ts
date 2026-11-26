import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { myflatDb?: Db };

/** Cliente compartilhado do app (um por processo; reaproveitado no hot reload do Next). */
export function getDb(): Db {
  if (!globalForDb.myflatDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada. Veja .env.example.");
    globalForDb.myflatDb = createDb(url);
  }
  return globalForDb.myflatDb;
}
