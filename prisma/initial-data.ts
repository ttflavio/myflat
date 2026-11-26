// Dados iniciais confirmados pelo cadastro da cliente.
// Só a estrutura: organização, prédios e flats pelo número. Nada inventado.
import type { Db } from "../src/server/db";

export const ORG = { slug: "flats-demo", name: "Flats Demo · Administração de temporada" };

export const FLATS: { building: string; code: string; ownedByManager: boolean }[] = [
  { building: "Edifício Atlântico", code: "346", ownedByManager: true }, // flat da própria administradora
  { building: "Edifício Atlântico", code: "206", ownedByManager: false },
  { building: "Edifício Atlântico", code: "204", ownedByManager: false },
  { building: "Edifício Atlântico", code: "152", ownedByManager: false },
  { building: "Edifício Atlântico", code: "319", ownedByManager: false },
  { building: "Residencial Maré", code: "502", ownedByManager: false },
];

/** Cria (se ainda não existir) a organização, os prédios e os flats. Idempotente. */
export async function ensureOrganization(db: Db) {
  const org = await db.organization.upsert({ where: { slug: ORG.slug }, update: {}, create: ORG });
  const buildings = new Map<string, string>();
  for (const name of new Set(FLATS.map((f) => f.building))) {
    const existing = await db.property.findFirst({ where: { organizationId: org.id, name } });
    const p = existing ?? (await db.property.create({ data: { organizationId: org.id, name, city: "João Pessoa" } }));
    buildings.set(name, p.id);
  }
  for (const f of FLATS) {
    const propertyId = buildings.get(f.building)!;
    await db.unit.upsert({
      where: { organizationId_propertyId_code: { organizationId: org.id, propertyId, code: f.code } },
      update: {},
      create: { organizationId: org.id, propertyId, code: f.code, name: `Flat ${f.code}`, ownedByManager: f.ownedByManager },
    });
  }
  return { org, buildings: buildings.size, flats: FLATS.length };
}
