# Arquitetura do MyFlat

> The Operating System for Short-Term Rentals.

Estado: **proposta da Fase 0** (24/11/2026). Decisões formais ficam em [docs/adr/](docs/adr/).

## 1. Visão em camadas

```
┌──────────────────────────────────────────────────────────────┐
│  UI (app/, ui/)         Next.js App Router · React · Tailwind │
│  páginas, formulários, calendário, inbox — sem regra de negócio│
├──────────────────────────────────────────────────────────────┤
│  Server actions / route handlers (server/)                    │
│  autenticação → TenantContext → autorização (RBAC) → Zod       │
├──────────────────────────────────────────────────────────────┤
│  Domínio (domain/)      regras puras e testáveis               │
│  disponibilidade, transições de status, finanças, tarefas      │
├──────────────────────────────────────────────────────────────┤
│  Persistência (db/)     Prisma + SQL nativo · RLS · auditoria  │
├──────────────────────────────────────────────────────────────┤
│  Integrações (integrations/)   adapters com interface comum    │
│  iCal · WhatsApp Cloud API · IA (Claude) · Storage · e-mail    │
├──────────────────────────────────────────────────────────────┤
│  Jobs (jobs/)           sync iCal, expiração de pré-reserva,   │
│                         lembretes, resumo diário               │
└──────────────────────────────────────────────────────────────┘
        PostgreSQL (fonte de verdade) · Storage de arquivos
```

Regra: **a UI nunca decide**. Esconder um botão é conveniência; a permissão é verificada no servidor e, para isolamento de tenant, também no banco.

## 2. Estrutura de pastas (alvo)

```
myflat-platform/
├── app/                      # rotas Next.js
│   ├── (auth)/login
│   ├── (app)/[org]/dashboard, properties, reservations, calendar,
│   │        guests, inbox, capture, tasks, cleaning, maintenance,
│   │        finance, reports, ai, automations, settings/*
│   └── api/webhooks/whatsapp, api/ical/[token].ics, api/cron/*
├── src/
│   ├── domain/               # regras puras (sem I/O)
│   │   ├── availability/     # intervalos, conflitos, transições
│   │   ├── reservations/
│   │   ├── tasks/
│   │   └── finance/
│   ├── server/               # casos de uso: auth, tenant, rbac, services
│   ├── db/                   # prisma client, repositórios com tenant
│   ├── integrations/
│   │   ├── channels/         # ChannelAdapter: ical, (airbnb, booking futuros)
│   │   ├── whatsapp/         # MessagingAdapter: cloud-api, demo
│   │   └── ai/               # AIProvider, ferramentas, prompts
│   ├── jobs/
│   └── ui/                   # design system: tokens, componentes
├── prisma/                   # schema.prisma, migrations (+ SQL nativo), seed
├── tests/                    # unit, integration (Postgres real), e2e
└── docs/                     # ADRs, recuperação, domínio
```

## 3. Modelo de domínio (primeira versão)

Todas as tabelas de negócio têm `organization_id`, `created_at`, `updated_at`; as sensíveis têm `deleted_at` (exclusão lógica) e auditoria.

| Grupo | Entidades | Notas |
|---|---|---|
| Tenant e acesso | `Organization`, `User`, `Membership` (user × org × role), `Role`, `Permission`, `RolePermission` | Papéis iniciais: owner, admin, operator, cleaner/maintenance, finance, property_owner (leitura do próprio imóvel) |
| Portfólio | `Property` (prédio/endereço), `Unit` (o flat que é reservado), `PropertyGroup`, `Owner`, `Amenity`, `UnitAmenity`, `Document`, `Photo` | Para flats avulsos, 1 Property : 1 Unit. A disponibilidade é sempre por **Unit** |
| Canais | `BookingChannel` (Airbnb, Booking, Decolar, WhatsApp, Direto, Manual, Outro), `ChannelListing` (unit × canal: código do anúncio, URL iCal de importação, token de exportação) | Herdeiro de `ImovelCanal` |
| Disponibilidade | `Occupancy` (reserva ou bloqueio, `daterange`, `is_active`, `source`), `AvailabilityBlock` (motivo), `AvailabilityEvent` (histórico), `SyncRun`, `ExternalCalendarEvent`, `SyncConflict` | Ver ADR-0003 |
| Reservas | `Reservation` (código, status, valores, hóspedes, canal), `ReservationStatusChange`, `ReservationChangeRequest` (ex.: antecipar check-in), `Guest` | Reservation 1:1 Occupancy enquanto ativa |
| Atendimento | `Lead`, `Conversation`, `Message`, `Tag`, `Note`, `FollowUp` | Lead → Reservation (conversão) |
| Operação | `Task` (categoria, prioridade, prazo, origem), `TaskRecurrence`, `CleaningSchedule`, `MaintenanceRequest`, `ServiceProvider`, `CaptureItem` (entrada da Quick Capture) | Manutenção pode gerar um `AvailabilityBlock` |
| Check-in/out | `CheckIn`, `CheckOut` | Registram horário real, quem fez e ocorrências |
| Financeiro | `Revenue`, `Expense`, `Payment`, `OwnerPayout`, `FeeRule` (taxa de canal, comissão) | **Previsto × recebido** é campo explícito; reserva não é pagamento |
| Plataforma | `Notification`, `Automation`, `AutomationRun`, `AuditLog`, `AIAction` (pedido, ferramentas chamadas, resultado, aprovação) | |

### Status de reserva e transições

```
consulta ──► aguardando_confirmacao ──► pre_reserva ──► confirmada ──► check_in_realizado ──► em_andamento ──► finalizada
    │                 │                     │  (expira)       │                   │
    └────► cancelada ◄┴─────────────────────┴─────────────────┘                   └──► (antecipação de check-out)
                                                       confirmada ──► no_show
```

- Só `pre_reserva` (não expirada), `confirmada`, `check_in_realizado` e `em_andamento` ocupam a agenda.
- `consulta` e `aguardando_confirmacao` **não** ocupam: são intenção, verificam disponibilidade só como aviso.
- Cada transição é uma função do domínio com pré-condições (ex.: check-in só no dia ou depois de `check_in`, com tolerância configurável) e gera `ReservationStatusChange` + `AuditLog`.

## 4. Integrações

### Canais (Airbnb, Booking.com, Decolar)

- **MVP: iCal**, importação e exportação, por `ChannelListing`. Airbnb e Booking.com oferecem iCal de importação/exportação no painel do anfitrião. Decolar: verificar com a administradora como os anúncios são geridos.
- iCal **não é tempo real** (os canais costumam atualizar em intervalos de minutos a horas) e **não traz** preço, hóspede, valor nem status completo. A interface mostra "última sincronização há X min" e trata o canal como sinal, não como verdade.
- APIs oficiais (Airbnb, Booking.com Connectivity) exigem parceria/credenciamento. A camada `ChannelAdapter` (`importAvailability`, `exportAvailability`, futuramente `pushRates`, `fetchReservations`) deixa espaço para elas ou para um channel manager intermediário.

### WhatsApp

- **WhatsApp Business Platform (Cloud API)**, oficial: webhook de mensagens e status, envio dentro da janela de 24 h, templates aprovados fora dela. Nada de WhatsApp Web ou automação não oficial.
- Exige: conta Meta Business verificada, número dedicado (sai do app comum do WhatsApp), token permanente de usuário de sistema. Até existir, roda o `DemoMessagingAdapter`, **com selo "Demonstração" visível** na inbox.

### IA

- Provedor: Claude (API da Anthropic), atrás de `AIProvider`.
- **Ferramentas tipadas e com escopo**: `search_reservations`, `check_availability`, `list_tasks`, `create_task_draft`, `suggest_reply`... Todas recebem o `TenantContext` do servidor, validam parâmetros com Zod e respeitam o papel do usuário.
- **Ações sensíveis viram rascunho** (`AIAction` com status `pending_approval`): criar/alterar reserva, cancelar, enviar mensagem ao hóspede, lançar pagamento. A pessoa aprova; o servidor executa.
- Quick Capture: a IA extrai `{unidade, categoria, título, prazo, prioridade, reserva relacionada}` com nível de confiança. Unidade não identificada → fila de triagem. Nada é inventado: campos não encontrados ficam vazios.

## 5. Segurança e qualidade

- Sessão segura (cookie httpOnly), senhas com hash forte ou login sem senha; 2FA na fase SaaS.
- RBAC por organização, checado em toda ação do servidor; RLS no banco (ADR-0002).
- Segredos só em variáveis de ambiente; `.env` fora do Git; `.env.example` sem valores reais.
- Webhooks com verificação de assinatura (WhatsApp `X-Hub-Signature-256`) e idempotência por ID de evento.
- LGPD: coletar o mínimo de dados do hóspede, sem documento de identidade por padrão, retenção configurável, exportação e exclusão a pedido.
- Auditoria (`AuditLog`) em reservas, ocupações, finanças, permissões e ações da IA.
- Testes obrigatórios listados no ROADMAP (sobreposição, concorrência, cancelamento, iCal idempotente, isolamento de tenant, permissões).

## 6. Design system (direção)

- Identidade própria, **não** derivada da Vivanti: base neutra (cinzas quentes), uma cor de marca para ação, cores semânticas para status de reserva e canal.
- Tipografia sans única para UI densa (ex.: Inter ou Geist), números tabulares em valores e datas.
- Tokens em CSS (`@theme` do Tailwind 4), como no site da Vivanti; componentes em `src/ui`: Button, Input, Select, Badge, StatCard, PageHeader, DataTable, Dialog, Drawer, Tooltip, EmptyState, Skeleton, Toast, CalendarGrid, TimelineRow.
- Padrões herdados da Vivanti como **comportamento**, não como estética: cabeçalho de página com sobretítulo + título + ação, cards de KPI, banner de alerta, ações inline nos cards de agenda.
- Light e dark mode; responsivo (a operação de limpeza e check-in acontece no celular).
