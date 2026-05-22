# Go-live — JM BeautyFlow

Execute após deploy da branch com Fase D e migrations aplicadas no Supabase.

## Supabase (antes do tráfego)

- [ ] `20260518000000_payment_logs.sql`
- [ ] `20260518100000_plan_features_catalog.sql`
- [ ] `20260518200000_fase_d_go_live_hardening.sql`
- [ ] Secrets: `MERCADO_PAGO_ACCESS_TOKEN` = `APP_USR-…`, `MERCADO_PAGO_WEBHOOK_SECRET` (obrigatório), `ALLOWED_APP_ORIGINS`
- [ ] Auth → URL Configuration: `https://jmbeautyflow.tech/reset-password` e `/auth/callback` nos Redirect URLs
- [ ] Redeploy: `create-mercado-pago-preference`, `mercado-pago-webhook`

## VPS

- [ ] `git pull` → `npm ci` → `npm run build` → `pm2 restart`
- [ ] `.env`: `VITE_SUPABASE_ANON_KEY=eyJ…` (sem `sb_publishable_`)

## Smoke manual

| # | Item | OK |
|---|------|-----|
| 1 | **Login** e-mail/senha → admin ou master | [ ] |
| 2 | **Cadastro** + plano → onboarding/admin | [ ] |
| 3 | **Recuperar senha** → e-mail → `/reset-password` → nova senha → login | [ ] |
| 4 | **Pagamento** checkout MP (teste) → retorno success/pending | [ ] |
| 5 | **Webhook** → linha em `payment_logs` + assinatura `active` | [ ] |
| 6 | **Plano** master toggles + tenant gate (ex. WhatsApp) | [ ] |
| 7 | **Agendamento** `/agendar/ma-barbearia` completo | [ ] |
| 8 | **Upload** logo/serviço | [ ] |
| 9 | **Logout** e novo login | [ ] |

## Segurança pós-Fase D

- [ ] Tenant **não** consegue chamar `company_simulate_payment_outcome` com sucesso
- [ ] POST webhook **sem** `x-signature` retorna 401 (com secret configurado)
