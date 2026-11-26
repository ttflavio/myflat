# ADR-0001: Stack da plataforma

- **Status:** Aceito em 24/11/2026 (opção A, confirmada pelo responsável pelo produto)
- **Data:** 24/11/2026

## Contexto

- O backend anterior era Spring Boot 4 + Java, mas o código se perdeu. Sobrou só o `pom.xml` e a lista de classes (auditoria guardada no repositório privado). **O custo de migração é praticamente zero**: não há código a portar.
- O produto precisa de uma interface de SaaS premium (calendário, inbox, kanban), API tipada, PostgreSQL, multi-tenant, IA e webhooks (WhatsApp, iCal).
- A equipe é pequena (diretor do produto + Lucas, em outra máquina). Uma só linguagem de ponta a ponta reduz o custo de contexto.
- O protótipo e o site da Vivanti já são React + Tailwind.

## Opções

| | A. Next.js full-stack (TypeScript) | B. Spring Boot (Java) + frontend React separado |
|---|---|---|
| Linguagens | 1 (TS) | 2 (Java + TS) |
| Repositórios/serviços | 1 app | 2 apps + contrato de API |
| Tipos compartilhados front/back | Nativos | Precisa gerar (OpenAPI) |
| Experiência prévia do time | Site da Vivanti (React) | Backend MyFlat antigo (Java) |
| Concorrência e transações | Prisma `$transaction` + SQL nativo | JPA/Hibernate, muito maduro |
| Deploy | Vercel/Render + Postgres gerenciado | Dois deploys |
| SDKs de IA e WhatsApp | Oficiais em TS | Disponíveis, menos exemplos |

## Decisão recomendada: A

- **Next.js (App Router) + React + TypeScript**, um só app com camadas separadas (`domain/`, `server/`, `integrations/`, `ui/`).
- **PostgreSQL** como fonte de verdade. **Prisma** para schema, migrations e consultas; **SQL nativo** nas migrations para o que o Prisma não expressa (constraint de exclusão de intervalos, RLS). Ver ADR-0003.
- **Supabase** como Postgres gerenciado de desenvolvimento e produção (região São Paulo), mais Storage para fotos e documentos. Resolve a falta de Docker nesta máquina. O app não depende de APIs proprietárias do Supabase além do Postgres e do Storage, para poder trocar de provedor.
- **Autenticação:** Auth.js (NextAuth) com sessão em banco, ou Supabase Auth. Decisão fechada na Fase 1, com critério: RBAC por organização no nosso banco, nunca só no token.
- **Validação:** Zod em toda entrada (formulários, rotas, webhooks, parâmetros de ferramentas da IA).
- **UI:** Tailwind CSS 4 + componentes próprios sobre primitivas acessíveis (Radix UI), tokens em CSS.
- **Testes:** Vitest (unidade e integração contra Postgres real), Playwright (E2E).
- **Jobs e automações:** fila em Postgres (tabela de jobs + cron) no MVP; n8n apenas para automações que a administradora queira editar sozinha.
- **IA:** API da Anthropic (Claude), com ferramentas tipadas e confirmação humana (ver ARCHITECTURE.md § IA).

## Consequências

- O código Java antigo não é reaproveitado; as **decisões de domínio** dele são (ocupação única, origem, motivo de bloqueio, imóvel × canal).
- Se a opção B for escolhida, a modelagem do banco, os ADRs 0002 e 0003 e o roadmap continuam válidos; muda a camada de aplicação.
