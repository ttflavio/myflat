import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createDb, type Db } from "@/server/db";
import type { TenantContext } from "@/server/tenant";
import type { Role } from "@/generated/prisma/enums";

let shared: Db | undefined;
export function testDb(): Db {
  shared ??= createDb(inject("databaseUrl"));
  return shared;
}

/** Cria uma organização isolada com um usuário e N flats. Cada teste usa a sua. */
export async function makeOrg(db: Db, opts: { units?: number; role?: Role } = {}) {
  const suffix = randomUUID().slice(0, 8);
  const org = await db.organization.create({ data: { name: `Org ${suffix}`, slug: `org-${suffix}` } });
  const user = await db.user.create({ data: { email: `u-${suffix}@example.test`, name: "Usuária de teste" } });
  const role = opts.role ?? "ADMIN";
  await db.membership.create({ data: { organizationId: org.id, userId: user.id, role } });
  const property = await db.property.create({ data: { organizationId: org.id, name: "Edifício Atlântico", city: "João Pessoa" } });
  const units = [];
  for (let i = 0; i < (opts.units ?? 1); i++) {
    units.push(
      await db.unit.create({
        data: { organizationId: org.id, propertyId: property.id, code: String(100 + i), name: `Flat ${100 + i}`, maxGuests: 3, commissionRate: "0.15" },
      }),
    );
  }
  const ctx: TenantContext = { organizationId: org.id, userId: user.id, role };
  return { org, user, units, ctx };
}
