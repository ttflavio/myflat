# ADR-0005: Pendências com IA

- **Status:** Aceito
- **Data:** 26/11/2026

## Contexto

A administradora quer "jogar" informação solta (anotação, mensagem encaminhada, lembrete) e ver cada pendência já na lista do flat certo, sem preencher formulário.

## Decisão

1. **Uma chamada à API do Claude por captura**, com **saída estruturada** (schema Zod validado pelo SDK oficial `@anthropic-ai/sdk`). Não é um agente com ferramentas: o servidor monta o contexto e grava. Modelo padrão `claude-opus-5-5` com esforço `low` (rápido e barato para extração); trocável por `MYFLAT_AI_MODEL`.
2. **Contexto enviado à IA:** a data de hoje (fuso de João Pessoa) com o dia da semana, a lista de flats (número e prédio) e o próximo check-in de cada um. Nenhum dado de hóspede é enviado.
3. **O servidor confere tudo antes de gravar** (`toDrafts`):
   - o flat precisa existir na organização; se não existir ou não for informado, a pendência vai para a **triagem**;
   - o prazo precisa ser uma data válida e plausível; senão é descartado e marcado para revisão;
   - quando a IA aponta ambiguidade (`reviewReason`), a pendência entra como "A revisar".
4. **Grava direto** quando está tudo claro (status "A fazer" na lista do flat). O texto original fica guardado na pendência para conferência.
5. **Recusa do modelo:** desvio automático no servidor da Anthropic (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Se ainda assim não houver resposta, a tela pede o cadastro manual.
6. **Sem chave configurada**, a captura com IA fica desativada e o cadastro manual continua funcionando.

## Consequências

- Custo por captura de centavos de dólar (estimativa; medir com o uso real).
- Testes usam um extrator falso (`Extractor`), então rodam sem chave e sem custo.
- Próximos passos: mesma conferência para as mensagens do WhatsApp (sugestão de resposta com disponibilidade real) e resumo diário.
