import { afterAll, describe, expect, it } from "vitest";
import { listProperties, missingFields, updateProperty, updateUnit, type UnitInput } from "@/server/units/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { makeOrg, testDb } from "../setup/factory";

const db = testDb();
afterAll(() => db.$disconnect());

const empty: UnitInput = {
  maxGuests: null,
  bedrooms: null,
  beds: null,
  bathrooms: null,
  checkInTime: null,
  checkOutTime: null,
  commission: null,
  notes: null,
  ownerName: null,
  ownerPhone: null,
  ownerEmail: null,
};

describe("cadastro de imóveis", () => {
  it("campos vazios aparecem como faltando; preencher remove a pendência", async () => {
    const { ctx, units } = await makeOrg(db, { role: "OWNER" });
    await updateUnit(db, ctx, units[0].id, empty);
    let view = (await listProperties(db, ctx)).units[0];
    expect(view.missing).toEqual(["capacidade", "quartos, camas e banheiros", "horários de check-in e check-out", "modalidade (15% ou 20%)", "proprietário"]);

    await updateUnit(db, ctx, units[0].id, {
      ...empty,
      maxGuests: 3,
      bedrooms: 1,
      beds: 2,
      bathrooms: 1,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      commission: "0.20",
      ownerName: "Proprietária Teste",
      ownerPhone: "83 0000-0000",
    });
    view = (await listProperties(db, ctx)).units[0];
    expect(view.missing).toEqual([]);
    expect(view.commission).toBe("0.20");
    expect(view.ownerName).toBe("Proprietária Teste");
  });

  it("flat da administradora não pede proprietário e desfaz o vínculo", async () => {
    const { ctx, units } = await makeOrg(db, { role: "OWNER" });
    await updateUnit(db, ctx, units[0].id, { ...empty, commission: "0.15", ownerName: "Alguém" });
    await updateUnit(db, ctx, units[0].id, { ...empty, commission: "OWN", ownerName: "Alguém" });
    const view = (await listProperties(db, ctx)).units[0];
    expect(view.commission).toBe("OWN");
    expect(view.ownerName).toBeNull();
    expect(missingFields(view)).not.toContain("proprietário");
  });

  it("valida horários e exige nome quando há contato do proprietário", async () => {
    const { ctx, units } = await makeOrg(db, { role: "OWNER" });
    await expect(updateUnit(db, ctx, units[0].id, { ...empty, checkInTime: "25:00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateUnit(db, ctx, units[0].id, { ...empty, commission: "0.15", ownerPhone: "83 9999-9999" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("só dono ou administração editam; outra organização não acessa", async () => {
    const a = await makeOrg(db, { role: "OWNER" });
    const op = await makeOrg(db, { role: "OPERATOR" });
    await expect(updateUnit(db, op.ctx, op.units[0].id, empty)).rejects.toBeInstanceOf(ForbiddenError);
    const b = await makeOrg(db, { role: "OWNER" });
    await expect(updateUnit(db, b.ctx, a.units[0].id, empty)).rejects.toBeInstanceOf(NotFoundError);
    const { properties } = await listProperties(db, a.ctx);
    await expect(updateProperty(db, b.ctx, properties[0].id, { address: "Rua X", neighborhood: null })).rejects.toBeInstanceOf(NotFoundError);
    await updateProperty(db, a.ctx, properties[0].id, { address: "Rua Teste, 1", neighborhood: "Beira-Mar" });
    expect((await listProperties(db, a.ctx)).properties[0].address).toBe("Rua Teste, 1");
  });
});
