// npx tsx scripts/ai-smoke-test.ts "texto" → chama a IA de verdade e mostra o que ela extrairia.
// NÃO grava nada no banco. Custa uma chamada à API.
import "dotenv/config";
import { claudeExtractor, toDrafts, type CaptureContext } from "../src/server/ai/capture";
import { todayIn } from "../src/domain/availability/dates";

async function main() {
  const text = process.argv[2] ?? "Flat 204 precisa trocar a resistência do chuveiro antes do próximo check-in. Comprar duas toalhas para o 319. O ar-condicionado está fazendo barulho.";
  const today = todayIn();
  const ctx: CaptureContext = {
    today,
    weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`)),
    units: ["346", "206", "204", "152", "319", "502"].map((code) => ({
      id: `u-${code}`,
      code,
      building: code === "502" ? "Residencial Maré" : "Edifício Atlântico",
      nextCheckIn: null,
    })),
  };
  const started = Date.now();
  const extraction = await claudeExtractor(text, ctx);
  console.log(JSON.stringify({ ms: Date.now() - started, extraction, drafts: toDrafts(extraction, ctx) }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
