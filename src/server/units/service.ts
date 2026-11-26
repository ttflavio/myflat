// Cadastro dos imóveis: prédios (endereço) e flats (capacidade, horários, proprietário, comissão).
// Campo vazio = ainda não informado. Nada é preenchido por padrão.
import { z } from "zod";
import type { Db } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, type TenantContext } from "../tenant";

const optInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato HH:MM").nullable();
const optText = (max: number) => z.string().trim().max(max).nullable();

export const unitInput = z.object({
  maxGuests: optInt(1, 30),
  bedrooms: optInt(0, 20),
  beds: optInt(0, 30),
  bathrooms: optInt(0, 20),
  checkInTime: time,
  checkOutTime: time,
  /** "OWN" = flat da administradora; "0.15"/"0.20" = modalidade; null = não definida. */
  commission: z.enum(["OWN", "0.15", "0.20"]).nullable(),
  notes: optText(2000),
  ownerName: optText(160),
  ownerPhone: optText(40),
  ownerEmail: z.string().trim().email("E-mail do proprietário inválido").max(200).nullable(),
});
export type UnitInput = z.input<typeof unitInput>;

export const propertyInput = z.object({
  address: optText(300),
  neighborhood: optText(120),
});

export type UnitView = {
  id: string;
  code: string;
  propertyId: string;
  propertyName: string;
  maxGuests: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  commission: "OWN" | "0.15" | "0.20" | null;
  notes: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  missing: string[];
};

export type PropertyView = { id: string; name: string; city: string; address: string | null; neighborhood: string | null };

function commissionOf(u: { ownedByManager: boolean; commissionRate: { toString(): string } | null }): UnitView["commission"] {
  if (u.ownedByManager) return "OWN";
  if (!u.commissionRate) return null;
  const r = Number(u.commissionRate.toString());
  return r === 0.15 ? "0.15" : r === 0.2 ? "0.20" : null;
}

/** O que ainda falta cadastrar em cada flat (para a checklist da administradora). */
export function missingFields(u: Omit<UnitView, "missing">): string[] {
  const m: string[] = [];
  if (u.maxGuests == null) m.push("capacidade");
  if (u.bedrooms == null || u.beds == null || u.bathrooms == null) m.push("quartos, camas e banheiros");
  if (!u.checkInTime || !u.checkOutTime) m.push("horários de check-in e check-out");
  if (u.commission == null) m.push("modalidade (15% ou 20%)");
  if (u.commission !== "OWN" && !u.ownerName) m.push("proprietário");
  return m;
}

export async function listProperties(db: Db, ctx: TenantContext): Promise<{ properties: PropertyView[]; units: UnitView[] }> {
  assertCan(ctx, "reservation:read");
  const [properties, units] = await Promise.all([
    db.property.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" } }),
    db.unit.findMany({
      where: { organizationId: ctx.organizationId },
      include: { property: { select: { name: true } }, owner: true },
      orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    }),
  ]);
  return {
    properties: properties.map((p) => ({ id: p.id, name: p.name, city: p.city, address: p.address, neighborhood: p.neighborhood })),
    units: units.map((u) => {
      const base = {
        id: u.id,
        code: u.code,
        propertyId: u.propertyId,
        propertyName: u.property.name,
        maxGuests: u.maxGuests,
        bedrooms: u.bedrooms,
        beds: u.beds,
        bathrooms: u.bathrooms,
        checkInTime: u.checkInTime,
        checkOutTime: u.checkOutTime,
        commission: commissionOf(u),
        notes: u.notes,
        ownerName: u.owner?.name ?? null,
        ownerPhone: u.owner?.phone ?? null,
        ownerEmail: u.owner?.email ?? null,
      };
      return { ...base, missing: missingFields(base) };
    }),
  };
}

export async function updateUnit(db: Db, ctx: TenantContext, unitId: string, raw: UnitInput) {
  assertCan(ctx, "unit:write");
  const parsed = unitInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Confira os dados do flat.", parsed.error.issues);
  const input = parsed.data;
  const unit = await db.unit.findFirst({ where: { id: unitId, organizationId: ctx.organizationId }, include: { owner: true } });
  if (!unit) throw new NotFoundError("Imóvel");

  return db.$transaction(async (tx) => {
    // Flat da própria administradora não tem proprietário; sem dados, o vínculo é desfeito.
    let ownerId: string | null = null;
    const hasOwnerData = !!(input.ownerName || input.ownerPhone || input.ownerEmail);
    if (input.commission !== "OWN" && hasOwnerData) {
      if (!input.ownerName) throw new ValidationError("Informe o nome do proprietário.");
      const data = { name: input.ownerName, phone: input.ownerPhone, email: input.ownerEmail };
      ownerId = unit.ownerId
        ? (await tx.owner.update({ where: { id: unit.ownerId }, data })).id
        : (await tx.owner.create({ data: { organizationId: ctx.organizationId, ...data } })).id;
    }
    const updated = await tx.unit.update({
      where: { id: unit.id },
      data: {
        maxGuests: input.maxGuests,
        bedrooms: input.bedrooms,
        beds: input.beds,
        bathrooms: input.bathrooms,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        ownedByManager: input.commission === "OWN",
        commissionRate: input.commission === "0.15" || input.commission === "0.20" ? input.commission : null,
        notes: input.notes,
        ownerId,
      },
    });
    await tx.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.userId, entity: "unit", entityId: unit.id, action: "unit_updated" },
    });
    return updated;
  });
}

export async function updateProperty(db: Db, ctx: TenantContext, propertyId: string, raw: z.input<typeof propertyInput>) {
  assertCan(ctx, "unit:write");
  const parsed = propertyInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Confira o endereço.", parsed.error.issues);
  const p = await db.property.findFirst({ where: { id: propertyId, organizationId: ctx.organizationId } });
  if (!p) throw new NotFoundError("Prédio");
  return db.property.update({ where: { id: p.id }, data: parsed.data });
}
