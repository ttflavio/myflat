# Roadmap do MyFlat

Atualizado em 24/11/2026. Status: ✅ feito · 🔄 em andamento · ⬜ a fazer.

## MVP recomendado: "Agenda à prova de overbooking + operação do dia"

O que mais tira trabalho e erro da operação da administradora nas primeiras semanas, na ordem:

1. **Um só calendário confiável** com todos os flats, reservas de todos os canais e bloqueios, onde o banco **impede** sobreposição.
2. **iCal com Airbnb e Booking.com** (importação + exportação), com última sincronização visível e conflitos sinalizados.
3. **Dashboard do dia**: check-ins, check-outs, limpezas, tarefas atrasadas e conflitos, calculados do banco.
4. **Tarefas por flat + Quick Capture** (texto livre → tarefa sugerida pela IA, revisada antes de salvar).
5. **Limpeza automática** sugerida a cada check-out.

Fica **fora do MVP**: WhatsApp oficial (depende de conta Meta verificada e número dedicado; a inbox entra logo depois), financeiro completo, assistente conversacional, planos e assinaturas.

Critério de pronto do MVP: a administradora usa o MyFlat por 2 semanas como **única** agenda, sem conflito que o sistema não tenha avisado.

---

## Fase 0: Recuperação e preparação 🔄

- ✅ Auditoria e recuperação do projeto anterior
- ✅ Estudo do protótipo e do site da Vivanti (padrões, sem dados)
- ✅ Arquitetura, ADRs 0001 a 0003, roadmap
- ✅ Repositório Git local com commit inicial
- ✅ Stack confirmada (ADR-0001)
- ✅ Protótipo navegável com os 6 flats do cadastro da cliente (repositório privado)
- ⬜ Escolher o banco de produção (Supabase recomendado)
- ⬜ Instalar `gh`, autenticar e criar o repositório privado `myflat-platform` no GitHub (comandos no README)
- ⬜ Colar aqui o "Resumo do MyFlat" do ChatGPT, se existir

## Fase 1: Fundação 🔄

- ✅ Projeto Next.js 16 + TypeScript, ESLint, Vitest, CI no GitHub Actions
- ✅ Prisma 7 + PostgreSQL; PostgreSQL embutido para dev e testes (sem Docker)
- ✅ Migration inicial com `btree_gist`, constraint de exclusão `occupancies_no_overlap` e CHECKs
- ✅ Organization, User, Membership, papéis e permissões (`TenantContext`, `assertCan`)
- ✅ **Motor de disponibilidade**: domínio puro (datas, estadias, status, comissão) + serviço de reservas e bloqueios
- ✅ 27 testes: sobreposição, dia de troca, bloqueio, cancelamento, mudança de datas, pré-reserva vencida, 20 reservas simultâneas, isolamento entre organizações e permissões
- ✅ Seed de desenvolvimento com os 6 flats da cliente
- ⬜ RLS no PostgreSQL (segunda camada do ADR-0002; exige papel de banco separado para o app)
- ✅ Login com sessões no banco (ADR-0004): senha scrypt, limite de tentativas, senha provisória com troca obrigatória, sair, trocar senha
- ✅ Usuários e permissões: tela de membros (adicionar, mudar papel, nova senha, remover), menu e botões conforme o papel, checagem no servidor
- ⬜ Troca de organização para quem pertence a mais de uma
- ⬜ "Esqueci minha senha" por e-mail e 2FA (dependem de envio de e-mail)
- ⬜ Proprietário do imóvel ver só os próprios flats (hoje vê a agenda toda)
- ✅ Design system v0 (tokens do protótipo, claro e escuro) e layout com menu lateral (celular: barra no topo)
- ✅ **Calendário real** (`/calendario`): linha do tempo de 21 dias lendo o banco, navegação por semana, nova reserva, pré-reserva, consulta, bloqueio, cancelar e liberar, com o conflito explicado na tela
- ⬜ Design system v1 (componentes isolados e documentados)
- ⬜ Playwright (E2E)

## Fase 2: Imóveis 🔄

- ✅ Tela Imóveis: endereço dos prédios, capacidade, quartos/camas/banheiros, horários, modalidade (15%/20%/própria) e proprietário de cada flat, com aviso do que falta
- ⬜ Comodidades, fotos (Storage), documentos, regras, informações de acesso
- Página de detalhe com abas (Visão geral, Reservas, Calendário, Tarefas, Limpeza, Manutenção, Financeiro, Documentos, Histórico)
- Usuários e permissões na interface

## Fase 3: Booking engine ⬜ (prioridade máxima)

- Reservas: CRUD, transições de status, histórico, código, valores (bruto, taxas, líquido)
- Bloqueios administrativos e de manutenção
- Calendário: mês, semana, timeline por unidade; criar/editar/cancelar arrastando; cores por status e canal
- Pré-reserva com expiração (job)
- iCal: importação idempotente agendada, exportação por token, `SyncRun`, `SyncConflict`, alertas, resolução manual
- **Testes obrigatórios:** sobreposição, borda check-out = check-in, bloqueios, cancelamento libera, alteração de datas, 20 reservas simultâneas para a mesma data (só 1 passa), reimportação iCal sem duplicar, conflito iCal × interna, isolamento de tenant

## Fase 4: Operação 🔄

- ✅ **Pendências por flat** (`/pendencias`): captura com IA (texto livre → pendências no flat certo), triagem do que a IA não teve certeza, cadastro manual, concluir e mudar status (ADR-0005)
- ✅ Chave da IA criada (sem créditos ainda); IA desligada por padrão até a decisão de colocar créditos
- ⬜ Colocar créditos, ligar `MYFLAT_AI_ENABLED` e medir custo real
- ⬜ Visões extras: kanban, atrasadas, hoje, por responsável; pendências recorrentes
- Limpeza vinculada a check-outs; manutenção com prestador, custo, fotos e bloqueio de agenda

## Fase 5: CRM e WhatsApp ⬜

- Inbox (3 colunas), leads, status, tags, responsável, notas, follow-ups, conversão em reserva
- WhatsApp Cloud API: webhook, envio, templates, status de entrega, janela de 24 h; modo demonstração identificado
- IA: classificação, resumo, sugestão de resposta (sempre aprovada por humano)

## Fase 6: Financeiro ⬜

- Receitas, despesas, taxas de canal, comissões, repasses ao proprietário
- Previsto × recebido; ocupação, ADR, RevPAR, receita por canal e por flat; relatórios

## Fase 7: IA e automações ⬜

- MyFlat AI com ferramentas de consulta (reservas, disponibilidade, tarefas, finanças) respeitando permissões
- Resumo diário; automações configuráveis com log e liga/desliga

## Fase 8: SaaS ⬜

- Onboarding de nova organização, planos e assinaturas, limites por plano
- Observabilidade (logs estruturados, erros, métricas), backups testados, deploy de produção
