# MyFlat

**Gestão de imóveis de temporada com calendário à prova de overbooking.**

O MyFlat junta num só lugar o que uma administradora de flats faz espalhado entre Airbnb, Booking, WhatsApp e planilhas: reservas de todos os canais, bloqueios, pendências de cada flat, operação do dia e repasses. Está em uso real por uma administradora com 6 flats em João Pessoa e foi desenhado desde o início como SaaS multi-tenant.

> Esta é a **vitrine pública** do projeto. O desenvolvimento acontece num repositório privado. Aqui os dados da cliente foram trocados por nomes fictícios (Edifício Atlântico, Residencial Maré).

## O que o sistema faz

| Tela | O que resolve |
|---|---|
| **Painel do dia** | Check-ins, check-outs, flats ocupados, pendências atrasadas e conflitos de hoje, calculados direto do banco |
| **Calendário** | Linha do tempo de 21 dias com todos os flats. Reserva, pré-reserva, consulta e bloqueio. Quando há choque de datas, a tela diz qual reserva ocupa |
| **Reservas** | Lista com filtros por período, flat, canal e status, busca por hóspede, mudança de datas e transições de status (confirmar, check-in, cancelar, no-show) |
| **Imóveis** | Prédios e flats com capacidade, quartos, horários, modalidade de comissão e proprietário, com aviso do que falta informar |
| **Pendências** | Tarefas por flat. Com a IA ligada, um texto livre ("chuveiro do 204 antes do próximo check-in; duas toalhas pro 319") vira uma pendência por ação, no flat certo |
| **Usuários** | Papéis (dona, administração, financeiro, limpeza, proprietário) com permissões verificadas no servidor |

## Destaques técnicos

- **Overbooking impossível no banco, não só na tela.** Toda ocupação (reserva ou bloqueio) é um intervalo `daterange` numa tabela com constraint de exclusão `EXCLUDE USING gist` (`btree_gist`). Dia de troca (saída = entrada) é permitido. Um teste dispara **20 reservas simultâneas para a mesma data e só uma passa**. Veja [ADR-0003](docs/adr/0003-overbooking.md).
- **Multi-tenant desde o primeiro dia.** Todo acesso passa por um `TenantContext` com `organizationId` e papel. Há testes de isolamento entre organizações ([ADR-0002](docs/adr/0002-multi-tenancy.md)).
- **Domínio puro e testável.** Datas, estadias, transições de status e comissão (15%/20% sobre total ou líquido, conforme o canal) ficam em `src/domain`, sem I/O.
- **Autenticação própria.** Sessões no banco com token em hash, senha com scrypt, bloqueio após 5 tentativas, senha provisória com troca obrigatória ([ADR-0004](docs/adr/0004-autenticacao.md)).
- **IA com saída estruturada e humano no controle.** A captura de pendências usa a API do Claude com schema Zod. O servidor confere tudo (o flat existe? o prazo é plausível?) e o que é ambíguo vai para triagem ([ADR-0005](docs/adr/0005-pendencias-com-ia.md)).
- **Testes contra PostgreSQL de verdade.** Os testes de integração sobem um PostgreSQL embutido e descartável, sem Docker.

## Stack

Next.js 16 (App Router, Server Components e Server Actions) · React 19 · TypeScript · Prisma 7 · PostgreSQL · Tailwind CSS 4 · Zod · Vitest · Claude API · Netlify + Neon.

## Estrutura

```
src/
  app/        telas (painel, calendário, reservas, imóveis, pendências, configurações)
  domain/     regras puras: disponibilidade, reservas, finanças, tarefas, papéis
  server/     casos de uso: sessão, tenant, reservas, calendário, IA
prisma/       schema, migrations (com SQL nativo da constraint de exclusão) e seed
tests/        unidade e integração
docs/adr/     decisões de arquitetura
```

Mais detalhes em [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md) e [CHANGELOG.md](CHANGELOG.md).

## Rodar localmente

Requisitos: Node.js 22+. Não precisa instalar PostgreSQL nem Docker.

```bash
npm install
cp .env.example .env        # troque a senha do DATABASE_URL e defina SEED_ADMIN_PASSWORD
npm run db:start            # PostgreSQL embutido (deixe este terminal aberto)
npm run db:migrate && npm run db:seed
npm run dev                 # http://localhost:3000, entre com admin@myflat.local
```

`npm test` roda os testes de unidade e integração. `npm run typecheck` e `npm run lint` conferem tipos e estilo.

## Próximos passos

Sincronização iCal com Airbnb e Booking (importação idempotente, exportação por token, conflitos sinalizados), limpeza automática a cada check-out, inbox do WhatsApp e financeiro com repasses.
