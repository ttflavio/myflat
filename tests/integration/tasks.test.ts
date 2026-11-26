import { afterAll, describe, expect, it } from "vitest";
import { buildPrompt, captureTasks, toDrafts, type Extraction, type Extractor } from "@/server/ai/capture";
import { assignTaskUnit, createTasks, listTasks, updateTaskStatus } from "@/server/tasks/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createReservation } from "@/server/reservations/service";
import { makeOrg, testDb } from "../setup/factory";

const db = testDb();
afterAll(() => db.$disconnect());

const TODAY = "2026-11-26";
const item = (over: Partial<Extraction["items"][number]>): Extraction["items"][number] => ({
  unitCode: null,
  category: "MAINTENANCE",
  title: "Verificar",
  details: null,
  dueDate: null,
  dueReason: null,
  priority: "MEDIUM",
  reviewReason: null,
  ...over,
});
const fake = (items: Extraction["items"]): Extractor => async () => ({ items });

describe("pendências", () => {
  it("com flat vai para a lista do flat; sem flat vai para a triagem", async () => {
    const { ctx, units } = await makeOrg(db);
    const [a, b] = await createTasks(
      db,
      ctx,
      [
        { unitId: units[0].id, title: "Trocar chuveiro", category: "MAINTENANCE" },
        { unitId: null, title: "Comprar toalhas", category: "PURCHASE" },
      ],
      { source: "MANUAL" },
    );
    expect(a.status).toBe("TODO");
    expect(b.status).toBe("INBOX");
    await expect(updateTaskStatus(db, ctx, b.id, "TODO")).rejects.toBeInstanceOf(ValidationError);
    const moved = await assignTaskUnit(db, ctx, b.id, units[0].id);
    expect(moved.status).toBe("TODO");
    const done = await updateTaskStatus(db, ctx, a.id, "DONE");
    expect(done.completedAt).not.toBeNull();
    expect((await listTasks(db, ctx)).map((t) => t.title)).toEqual(["Comprar toalhas"]);
  });

  it("não deixa usar flat de outra organização nem mexer em pendência alheia", async () => {
    const a = await makeOrg(db);
    const b = await makeOrg(db);
    await expect(createTasks(db, b.ctx, [{ unitId: a.units[0].id, title: "Invasão", category: "OTHER" }], { source: "MANUAL" })).rejects.toBeInstanceOf(NotFoundError);
    const [t] = await createTasks(db, a.ctx, [{ unitId: a.units[0].id, title: "Própria", category: "OTHER" }], { source: "MANUAL" });
    await expect(updateTaskStatus(db, b.ctx, t.id, "DONE")).rejects.toBeInstanceOf(NotFoundError);
    expect(await listTasks(db, b.ctx)).toHaveLength(0);
  });

  it("financeiro só lê; não cria pendência", async () => {
    const { ctx, units } = await makeOrg(db, { role: "FINANCE" });
    await expect(createTasks(db, ctx, [{ unitId: units[0].id, title: "X teste", category: "OTHER" }], { source: "MANUAL" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("conferência do que a IA devolve", () => {
  const context = {
    today: TODAY,
    weekday: "quinta-feira",
    units: [
      { id: "u-204", code: "204", building: "Edifício Atlântico", nextCheckIn: "2026-12-02" },
      { id: "u-319", code: "319", building: "Edifício Atlântico", nextCheckIn: null },
    ],
  };

  it("flat reconhecido vira id; flat inexistente fica sem flat e pede revisão", () => {
    const drafts = toDrafts(
      { items: [item({ unitCode: "204", title: "Trocar resistência" }), item({ unitCode: "Flat 319" }), item({ unitCode: "999" })] },
      context,
    );
    expect(drafts[0].unitId).toBe("u-204");
    expect(drafts[0].reviewReason).toBeNull();
    expect(drafts[1].unitId).toBe("u-319");
    expect(drafts[2].unitId).toBeNull();
    expect(drafts[2].reviewReason).toMatch(/999/);
  });

  it("prazo inválido ou absurdo é descartado e marcado para revisão", () => {
    const drafts = toDrafts(
      { items: [item({ unitCode: "204", dueDate: "02/12/2026" }), item({ unitCode: "204", dueDate: "2020-01-01" }), item({ unitCode: "204", dueDate: "2026-12-02", dueReason: "próximo check-in" })] },
      context,
    );
    expect(drafts[0].dueDate).toBeNull();
    expect(drafts[0].reviewReason).toBeTruthy();
    expect(drafts[1].dueDate).toBeNull();
    expect(drafts[1].reviewReason).toBeTruthy();
    expect(drafts[2].dueDate).toBe("2026-12-02");
    expect(drafts[2].dueReason).toBe("próximo check-in");
  });

  it("o prompt traz a data, o dia da semana e o próximo check-in de cada flat", () => {
    const p = buildPrompt("chuveiro do 204", context);
    expect(p).toContain("quinta-feira, 2026-11-26");
    expect(p).toContain("204 (Edifício Atlântico), próximo check-in em 2026-12-02");
    expect(p).toContain("319 (Edifício Atlântico), sem check-in agendado");
  });
});

describe("captura completa (IA simulada)", () => {
  it("separa as pendências, grava no flat certo e guarda o texto original", async () => {
    const { ctx, units } = await makeOrg(db, { units: 2 });
    const [u0, u1] = units;
    let seenContext: Parameters<Extractor>[1] | undefined;
    await createReservation(db, ctx, { unitId: u0.id, channel: "AIRBNB", checkIn: "2026-12-02", checkOut: "2026-12-05" });
    const extractor: Extractor = async (_text, c) => {
      seenContext = c;
      return {
        items: [
          item({ unitCode: u0.code, title: "Trocar resistência do chuveiro", dueDate: "2026-12-02", dueReason: "próximo check-in", priority: "HIGH" }),
          item({ unitCode: u1.code, category: "PURCHASE", title: "Comprar duas toalhas" }),
          item({ unitCode: null, category: "OTHER", title: "Ver barulho no ar", reviewReason: "Flat não informado" }),
        ],
      };
    };
    const text = `Chuveiro do ${u0.code} antes do check-in. Duas toalhas pro ${u1.code}. Ar fazendo barulho.`;
    const created = await captureTasks(db, ctx, text, extractor, TODAY);
    expect(seenContext?.units.find((u) => u.code === u0.code)?.nextCheckIn).toBe("2026-12-02");
    expect(created.map((t) => [t.unitId, t.status])).toEqual([
      [u0.id, "TODO"],
      [u1.id, "TODO"],
      [null, "INBOX"],
    ]);
    expect(created.every((t) => t.source === "AI" && t.sourceText === text)).toBe(true);
  });

  it("texto vazio é recusado; resposta sem pendências não grava nada", async () => {
    const { ctx } = await makeOrg(db);
    await expect(captureTasks(db, ctx, "  ", fake([]), TODAY)).rejects.toBeInstanceOf(ValidationError);
    expect(await captureTasks(db, ctx, "obrigada!", fake([]), TODAY)).toEqual([]);
    expect(await listTasks(db, ctx)).toHaveLength(0);
  });
});
