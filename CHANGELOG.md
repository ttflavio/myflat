# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Adicionado
- 26/11/2026: Painel do dia (`/painel`) como tela inicial, calculado do banco. Publicação provisória em o ambiente de produção (privado) (Netlify + Neon).
- 26/11/2026: Tela Imóveis (endereço dos prédios; capacidade, quartos, horários, modalidade e proprietário de cada flat, com o que falta informar). IA de pendências desligada por padrão (`MYFLAT_AI_ENABLED`), cadastro manual como forma principal. 4 testes novos (51 no total).
- 26/11/2026: Pendências por flat com IA (ADR-0005). Tela `/pendencias` com captura em texto livre (Claude, saída estruturada), triagem, cadastro manual e status; conferência no servidor (flat existe, prazo plausível); texto original guardado; 8 testes novos (47 no total) com IA simulada.
- 25/11/2026: Cadastro limpo: só administração e os 6 flats do cadastro da cliente, sem dados inventados.
- 25/11/2026: Login e permissões (ADR-0004). Tela de login, sair, Minha conta (troca de senha, primeiro acesso), Configurações › Usuários; sessões no banco com token em hash; scrypt; bloqueio após 5 erros; regras de donos; menu e calendário conforme o papel; 12 testes novos (39 no total). O modo de desenvolvimento sem login foi removido.
- 25/11/2026: Calendário real em `/calendario` (Server Components + Server Actions): linha do tempo dos flats, criação de reserva e bloqueio, cancelamento e liberação, mensagens de conflito; layout com menu; tokens visuais; sessão de desenvolvimento sem login (bloqueada em produção).
- 25/11/2026: Fase 1 (parte 1). Schema Prisma (organizações, papéis, imóveis, unidades, canais, hóspedes, reservas, ocupações, histórico de disponibilidade, tarefas, auditoria); migration com constraint de exclusão anti-overbooking; PostgreSQL embutido (`npm run db:start`); domínio de datas, estadias, status e comissão; serviço de reservas e bloqueios com conflito explicado; seed com os 6 flats; 27 testes; CI.
- 24/11/2026: Protótipo navegável e regras de negócio da cliente inicial (documentos privados).
- 24/11/2026: Fase 0. Auditoria do projeto anterior, arquitetura, ADRs 0001 (stack, proposto), 0002 (multi-tenancy) e 0003 (overbooking), roadmap com MVP, guia de contribuição, `.env.example`, `.gitignore`.
