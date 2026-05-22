# Checklist manual pós-deploy — Fase A pré-venda

Execute após `git pull`, `npm ci`, `npm run build` e `pm2 restart` na VPS.

Confirme `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (JWT `eyJ...`), sem `sb_publishable_`.

## Supabase (antes do tráfego)

- [ ] Migration `20260518000000_payment_logs.sql` aplicada no SQL Editor
- [ ] Edge Function `mercado-pago-webhook` redeployada (`npm run supabase:deploy:mercado-pago-webhook`)
- [ ] Secrets: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

## Smoke test (produção)

| # | Rota / fluxo | Esperado |
|---|----------------|----------|
| 1 | `/` (home) | Carrega; seção planos com dados reais ou mensagem de erro + “Tentar novamente” |
| 2 | `/#planos` | Idem |
| 3 | `/plans` | Planos do Supabase ou erro amigável |
| 4 | `/cadastro` | Formulário abre; planos reais ou aviso (cadastro ainda permitido) |
| 5 | `/login` (master) | Login `melquemendes96@gmail.com` → `/master/empresas` |
| 6 | `/login` (tenant MA) | Login empresa → `/admin` |
| 7 | `/admin/plano` | **Sem** bloco “Pagamento simulado” em produção |
| 8 | Checkout MP (teste) | Preferência abre; retorno success/failure no `/admin/plano` |
| 9 | Webhook MP | Pagamento teste gera linha em `payment_logs` (Supabase Table Editor) |
| 10 | `/agendar/ma-barbearia` | Fluxo serviço → data → horário → confirma |

## Rollback rápido

1. Reverter deploy para commit anterior à branch `pre-venda-safe`.
2. Opcional: `DROP TABLE IF EXISTS public.payment_logs;` (só se necessário).

## Snapshot tabelas críticas (manual)

Rodar no SQL Editor antes de mudanças grandes:

`supabase/scripts/pre_venda_snapshot_critical_tables.sql`
