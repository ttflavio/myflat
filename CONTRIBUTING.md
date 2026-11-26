# Como contribuir

## Fluxo

1. `git pull` na `main`.
2. Crie um branch: `feat/booking-engine`, `fix/ical-duplicates`, `docs/adr-0004`.
3. Commits pequenos e descritivos (Conventional Commits): `feat(reservations): impede sobreposição de datas`.
4. Abra um Pull Request para a `main`. Os testes precisam passar.
5. Decisão de arquitetura nova → ADR em `docs/adr/NNNN-titulo.md`.
6. Mudança visível → linha no `CHANGELOG.md`.

## Regras do código

- **Código em inglês, interface em português** (pt-BR).
- Regra de negócio mora em `src/domain` (funções puras, testadas). A UI não decide nada.
- Toda consulta passa pelo `TenantContext`. Nunca aceite `organizationId` vindo do cliente.
- Toda entrada externa é validada com Zod (formulários, rotas, webhooks, ferramentas da IA).
- Disponibilidade só muda por `domain/availability`; o banco garante a não sobreposição.
- Migrations nunca são editadas depois de aplicadas: crie uma nova.
- Sem dados fictícios exibidos como reais. Modo demonstração sempre identificado na tela.

## Segredos e dados pessoais

- `.env` nunca vai para o Git. Atualize o `.env.example` (sem valores) quando criar uma variável.
- Dados de hóspedes reais não entram em seeds, testes, issues nem prints.
- Encontrou um segredo commitado? Revogue a credencial primeiro, depois limpe o histórico.

## Testes

- `npm test`: unidade e integração (Postgres real; o banco de teste é recriado).
- `npm run test:e2e`: Playwright.
- Bugs de disponibilidade ganham um teste que reproduz o caso antes da correção.
