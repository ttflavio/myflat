# ADR-0004: Login com sessões próprias no banco

- **Status:** Aceito
- **Data:** 25/11/2026

## Contexto

O ADR-0001 deixou em aberto Auth.js ou Supabase Auth. O MyFlat precisa de: login por e-mail e senha para uma equipe pequena (administradora, recepção, limpeza, financeiro, proprietários), papéis por organização, revogação imediata (quem sai da equipe perde o acesso na hora) e nada que dependa de um provedor externo para funcionar.

## Decisão

- **Sessões no PostgreSQL**, sem biblioteca de autenticação:
  - o cookie `mf_session` (httpOnly, SameSite=Lax, Secure em produção, 30 dias) guarda um token aleatório de 256 bits;
  - o banco guarda só o **SHA-256** do token (`sessions.token_hash`). Vazamento do banco não entrega sessões válidas;
  - toda requisição valida a sessão **e** a participação atual na organização: remover alguém ou desativar a conta derruba o acesso na próxima requisição.
- **Senhas com scrypt** (`node:crypto`, N=16384, r=8, p=1, sal de 16 bytes), comparação em tempo constante. Mínimo de 10 caracteres.
- **Limite de tentativas:** 5 erros por e-mail em 15 minutos bloqueiam o login. A resposta é a mesma para e-mail inexistente e senha errada, e o tempo também (compara com um hash fictício).
- **Contas criadas pela administração** recebem senha provisória, mostrada uma única vez, e a pessoa é obrigada a trocar no primeiro acesso.
- **Trocar a senha** exige a atual e encerra as outras sessões. Gerar nova senha provisória encerra todas.
- **Regras de membros:** só dono ou administração gerenciam; só dono mexe em donos; a organização nunca fica sem dono. Tudo registrado em `audit_logs`.
- Server Actions são endpoints públicos: cada uma chama `getSession()` e o serviço checa a permissão de novo (`assertCan`).

## Consequências

- Sem dependência nova e sem custo por usuário. Login social, "esqueci minha senha" por e-mail e 2FA ficam para a fase SaaS (exigem envio de e-mail).
- O usuário com várias organizações entra na primeira; a troca de organização é um próximo passo.
- Se um dia migrar para Supabase Auth ou Auth.js, `getSession()` continua sendo a única porta: o resto do app não muda.
