# ADR-0003: Prevenção de overbooking no banco

- **Status:** Aceito
- **Data:** 24/11/2026

## Contexto

Duas reservas do mesmo imóvel não podem se sobrepor, mesmo com requisições simultâneas, importação iCal e pré-reservas. Verificar só na aplicação ("existe conflito?" e depois "insira") tem condição de corrida.

## Decisão

1. **Uma tabela de ocupação** (`occupancies`), herdeira da `OcupacaoImovel` do backend antigo. Toda coisa que ocupa o imóvel vira uma linha: reserva, pré-reserva, bloqueio administrativo, manutenção, evento externo importado.
2. **Intervalo meio-aberto** `[check_in, check_out)` com tipo `daterange`. Check-out no dia X e check-in no dia X do próximo hóspede não conflitam.
3. **Constraint de exclusão no PostgreSQL** (extensão `btree_gist`):

   ```sql
   ALTER TABLE occupancies ADD CONSTRAINT occupancies_no_overlap
     EXCLUDE USING gist (
       organization_id WITH =,
       unit_id WITH =,
       stay WITH &&
     ) WHERE (is_active);
   ```

   `is_active` é verdadeiro para reservas que ocupam (pré-reserva válida, confirmada, em andamento) e bloqueios ativos; falso para cancelada, no-show finalizado, consulta e pré-reserva expirada. Cancelar libera a data imediatamente.
4. **Erro traduzido:** a violação (`23P01`) vira `AvailabilityConflictError` com as ocupações conflitantes, mostrada na interface.
5. **Pré-reserva com expiração:** `hold_expires_at`; um job marca as vencidas como inativas. Até lá, a pré-reserva bloqueia de verdade.
6. **Eventos externos (iCal) não sobrescrevem reservas internas.** Um evento importado que colide com reserva interna **não é inserido como ocupação ativa**: vira um registro de `SyncConflict` + alerta para resolução manual. A fonte de verdade é o MyFlat.
7. **Idempotência:** eventos importados têm chave única (`channel_listing_id`, `external_uid`). Reimportar o mesmo calendário não duplica.
8. **Histórico:** toda mudança de ocupação gera linha em `availability_events` (quem, quando, antes/depois, origem).

## Consequências

- Exige PostgreSQL (não SQLite) também nos testes: os testes de concorrência rodam contra Postgres real.
- Migrations com SQL nativo ao lado do schema Prisma.
