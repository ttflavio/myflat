# ADR-0002: Multi-tenancy por coluna + RLS

- **Status:** Aceito
- **Data:** 24/11/2026

## Contexto

O MyFlat começa com uma administradora (~10 flats), mas será vendido a outras. Um usuário nunca pode ver dados de outra organização.

## Decisão

1. **Banco compartilhado, esquema compartilhado, coluna `organization_id`** em toda tabela de negócio (não um banco por cliente: caro e lento de operar nesta escala).
2. **Três camadas de defesa:**
   - **Aplicação:** todo acesso a dados passa por um repositório que recebe o `TenantContext` (organização + usuário + papel) vindo da sessão. Nenhuma consulta recebe `organizationId` do cliente.
   - **Banco (RLS):** Row Level Security no PostgreSQL, com `current_setting('app.organization_id')` definido por transação. Se a aplicação esquecer um filtro, o banco bloqueia.
   - **Integridade:** chaves estrangeiras compostas (`organization_id`, `id`) onde houver relação entre entidades do tenant, para impedir que uma reserva da organização A aponte para um imóvel da organização B.
3. **Usuário × organização:** um usuário pode pertencer a várias organizações via `Membership` (com papel). Isso permite, no futuro, o proprietário ou um prestador de serviço em mais de uma administradora.
4. **Testes obrigatórios de isolamento** (dois tenants semeados; toda rota testada com o usuário errado).

## Consequências

- Índices começam por `organization_id`.
- Webhooks externos (WhatsApp, iCal) resolvem o tenant pela conexão cadastrada (número, URL), nunca por um parâmetro da requisição.
