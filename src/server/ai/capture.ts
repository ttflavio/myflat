// Captura de pendências com IA: texto livre → pendências por flat.
// A IA só sugere; o servidor confere tudo (flat existe? data válida?) antes de gravar.
// Regra de ouro: nada inventado. Flat ou prazo duvidoso fica vazio e vai para revisão.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { diffDays, fromUtcDate, isIsoDate, todayIn, toUtcDate, type IsoDate } from "@/domain/availability/dates";
import { TASK_CATEGORIES, TASK_PRIORITIES } from "@/domain/tasks/labels";
import type { Db } from "../db";
import { AppError, ValidationError } from "../errors";
import { createTasks, type TaskDraft } from "../tasks/service";
import { assertCan, type TenantContext } from "../tenant";

export const AI_MODEL = process.env.MYFLAT_AI_MODEL || "claude-opus-5-5";

// ----- O que a IA devolve (saída estruturada, validada pelo SDK) -----
export const extractionSchema = z.object({
  items: z.array(
    z.object({
      unitCode: z.string().nullable().describe("Número do flat exatamente como na lista, ou null se não der para saber."),
      category: z.enum(TASK_CATEGORIES),
      title: z.string().describe("Ação curta no infinitivo, em português. Ex.: 'Trocar a resistência do chuveiro'."),
      details: z.string().nullable().describe("Detalhes úteis do texto original, sem inventar nada."),
      dueDate: z.string().nullable().describe("AAAA-MM-DD, só se o texto der o prazo (data, dia da semana, 'amanhã', 'antes do próximo check-in')."),
      dueReason: z.string().nullable().describe("De onde veio o prazo. Ex.: 'próximo check-in do flat 204 em 2026-12-02'."),
      priority: z.enum(TASK_PRIORITIES),
      reviewReason: z.string().nullable().describe("Preencha se algo estiver ambíguo ou depender de confirmação humana; senão null."),
    }),
  ),
});
export type Extraction = z.infer<typeof extractionSchema>;

export type CaptureContext = {
  today: IsoDate;
  weekday: string;
  units: { id: string; code: string; building: string; nextCheckIn: IsoDate | null }[];
};

/** Quem extrai: a IA de verdade em produção, uma função falsa nos testes. */
export type Extractor = (text: string, context: CaptureContext) => Promise<Extraction>;

const SYSTEM = `Você organiza as pendências de uma administradora de flats de temporada em João Pessoa.
Recebe um texto solto (anotação, mensagem encaminhada, lembrete) e devolve as pendências que ele contém, uma por ação distinta.

Regras:
- Use só os flats da lista fornecida. "unitCode" deve ser exatamente um número da lista. Se o texto não deixar claro qual flat é, use null. Nunca adivinhe.
- Prazo: só preencha "dueDate" se o texto indicar (data, dia da semana, "hoje", "amanhã", "antes do próximo check-in"). Para "antes do próximo check-in", use a data de próximo check-in do flat informada na lista; se não houver, deixe null e explique em "reviewReason". Nunca invente prazo.
- Categorias: MAINTENANCE (consertos, vazamento, ar-condicionado, chuveiro), CLEANING (limpeza), PURCHASE (comprar itens), RESTOCK (repor itens que acabam: café, papel, amenities), CHECK_IN, CHECK_OUT, GUEST_REQUEST (pedido de hóspede: antecipar check-in, berço etc.), GUEST_SERVICE, DOCUMENTS, FINANCE, OTHER.
- Prioridade: URGENT para risco ou dano em andamento (vazamento, sem água, sem energia, porta que não tranca, hóspede afetado agora); HIGH se o prazo é em até 2 dias ou afeta o próximo hóspede; MEDIUM no geral; LOW sem pressa.
- Pedido de hóspede que mexe em reserva ou horário precisa de confirmação: preencha "reviewReason".
- Título curto, no infinitivo, em português do Brasil. Não acrescente informação que não está no texto.
- Se o texto não tiver nenhuma pendência, devolva "items": [].`;

export function buildPrompt(text: string, ctx: CaptureContext): string {
  const flats = ctx.units
    .map((u) => `- ${u.code} (${u.building})${u.nextCheckIn ? `, próximo check-in em ${u.nextCheckIn}` : ", sem check-in agendado"}`)
    .join("\n");
  return `Hoje é ${ctx.weekday}, ${ctx.today}.\n\nFlats cadastrados:\n${flats}\n\nTexto:\n"""\n${text}\n"""`;
}

let client: Anthropic | undefined;

/** A IA só liga quando alguém decide: MYFLAT_AI_ENABLED=true e a chave presente. */
export function aiConfigured(): boolean {
  return process.env.MYFLAT_AI_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

/** Extrator real (Claude). Saída estruturada + desvio automático se o modelo recusar. */
export const claudeExtractor: Extractor = async (text, ctx) => {
  if (!aiConfigured()) throw new AppError("ai_not_configured", "A IA ainda não está configurada (falta ANTHROPIC_API_KEY no .env).");
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(extractionSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(text, ctx) }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new AppError("ai_no_answer", "A IA não conseguiu organizar esse texto. Cadastre a pendência manualmente.");
    }
    return response.parsed_output;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AppError("ai_auth", "A chave da IA é inválida. Confira ANTHROPIC_API_KEY.");
    if (err instanceof Anthropic.RateLimitError) throw new AppError("ai_busy", "A IA está com muitos pedidos agora. Tente de novo em instantes.");
    if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
      throw new AppError("ai_no_credits", "A conta da Anthropic está sem créditos. Adicione créditos em platform.claude.com › Billing e tente de novo.");
    }
    if (err instanceof Anthropic.APIError) throw new AppError("ai_error", `A IA respondeu com erro (${err.status}). Tente de novo.`);
    throw err;
  }
};

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export async function loadCaptureContext(db: Db, ctx: TenantContext, today = todayIn()): Promise<CaptureContext> {
  const units = await db.unit.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE" },
    include: {
      property: { select: { name: true } },
      occupancies: {
        where: { isActive: true, kind: "RESERVATION", checkIn: { gte: toUtcDate(today) } },
        orderBy: { checkIn: "asc" },
        take: 1,
        select: { checkIn: true },
      },
    },
    orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
  });
  return {
    today,
    weekday: WEEKDAYS[toUtcDate(today).getUTCDay()],
    units: units.map((u) => ({
      id: u.id,
      code: u.code,
      building: u.property.name,
      nextCheckIn: u.occupancies[0] ? fromUtcDate(u.occupancies[0].checkIn) : null,
    })),
  };
}

/** Confere o que a IA devolveu contra os dados reais. Tudo que não bate vira revisão, nunca chute. */
export function toDrafts(extraction: Extraction, ctx: CaptureContext): TaskDraft[] {
  return extraction.items.map((it) => {
    const code = it.unitCode?.trim().replace(/^flat\s*/i, "") ?? null;
    const unit = code ? ctx.units.find((u) => u.code === code) : undefined;
    const reasons: string[] = [];
    if (it.reviewReason) reasons.push(it.reviewReason);
    if (code && !unit) reasons.push(`O flat "${code}" não está cadastrado.`);

    let dueDate: string | null = it.dueDate && isIsoDate(it.dueDate) ? it.dueDate : null;
    if (it.dueDate && !dueDate) reasons.push("Prazo em formato inválido; confira.");
    // Prazo muito no passado ou absurdo no futuro é tratado como erro de leitura.
    if (dueDate && (diffDays(ctx.today, dueDate) < -1 || diffDays(ctx.today, dueDate) > 400)) {
      reasons.push(`Prazo ${dueDate} parece errado; confira.`);
      dueDate = null;
    }
    return {
      unitId: unit?.id ?? null,
      title: it.title.trim().slice(0, 200) || "Pendência sem título",
      description: it.details?.trim() || null,
      category: it.category,
      priority: it.priority,
      dueDate,
      dueReason: dueDate ? (it.dueReason?.trim() || null) : null,
      reviewReason: reasons.length ? reasons.join(" ").slice(0, 300) : null,
    };
  });
}

export const MAX_CAPTURE_CHARS = 3000;

/** Fluxo completo: contexto → IA → conferência → grava. Devolve o que foi criado. */
export async function captureTasks(db: Db, ctx: TenantContext, text: string, extractor: Extractor = claudeExtractor, today?: IsoDate) {
  assertCan(ctx, "task:write");
  const clean = text.trim();
  if (clean.length < 3) throw new ValidationError("Escreva o que precisa ser feito.");
  if (clean.length > MAX_CAPTURE_CHARS) throw new ValidationError(`Texto longo demais (máximo de ${MAX_CAPTURE_CHARS} caracteres).`);
  const context = await loadCaptureContext(db, ctx, today);
  const extraction = await extractor(clean, context);
  const drafts = toDrafts(extraction, context);
  if (!drafts.length) return [];
  return createTasks(db, ctx, drafts, { source: "AI", sourceText: clean });
}
