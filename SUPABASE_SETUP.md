## BeautyFlow Studio — aplicar migrations no Supabase

O erro `relation "public.platform_admins" does not exist` significa que as tabelas ainda **não foram criadas** no banco do Supabase.

### Caminho mais rápido (Supabase Dashboard)

1. Abra o **Supabase Dashboard** do seu projeto.
2. Vá em **SQL Editor**.
3. Execute **primeiro** a Fase 2 (schema/tabelas):
   - Arquivo: `supabase/migrations/20260206120000_fase2_multi_tenant_schema.sql`
4. Depois execute a Fase 3 (RLS/policies/RPCs):
   - Arquivo: `supabase/migrations/20260206120100_fase3_rls_policies.sql`

### Validar que as tabelas foram criadas

No SQL Editor:

```sql
select to_regclass('public.platform_admins') as platform_admins;
```

Se retornar `platform_admins`, está ok.

### Chave anon no `.env` (obrigatório)

O painel usa **PostgREST** (`/rest/v1`). Use a chave **anon legacy** (JWT que começa com `eyJ...`):

- Dashboard → **Settings → API → Legacy API Keys → anon**
- No `.env`: `VITE_SUPABASE_ANON_KEY=eyJ...`
- A chave nova `sb_publishable_...` **sozinha** costuma gerar **401** em `platform_admins` / `company_users`.

Depois de alterar o `.env`, rode `npm run build` (produção) e reinicie o dev server.

### Criar o dono do SaaS (Painel Master)

O painel master usa a tabela `public.platform_admins` (não colunas em `auth.users`).

1. Pegue o UUID do seu usuário em **Authentication → Users**.
2. No SQL Editor:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'seu@email.com'
on conflict do nothing;
```

3. Aplique a migration `20260516300000_auth_panel_context_master_rls.sql` (RPC `get_auth_panel_context`).
4. Faça logout/login no app e acesse `/master`.

### Billing Mercado Pago (Fase 12)

1. Aplique as migrations até `20260509000100_fase12_mercado_pago_billing.sql` (substitui `subscriptions` / `payments` por `tenant_subscriptions` / `payment_transactions`).
2. Faça deploy das Edge Functions: `create-mercado-pago-preference` e `mercado-pago-webhook`.
3. No painel do Supabase, em **Edge Functions → Secrets**, defina `MERCADO_PAGO_ACCESS_TOKEN` (e opcionalmente `MERCADO_PAGO_WEBHOOK_SECRET`).
4. Defina também `ALLOWED_APP_ORIGINS` com o domínio exato do frontend (sem barra final), separados por vírgula se houver mais de um. Sem isso, apenas `http://localhost` / `127.0.0.1` será aceito pela função `create-mercado-pago-preference`.
   - **Deploy no Lovable:** inclua `https://jmbeautyflow.lovable.app` (ou a URL exata que o Lovable mostrar na barra de endereço). Ex.: `https://jmbeautyflow.lovable.app,https://seudominio.com`
5. Aplique a migration `20260509000300_fase12_payment_reject_no_suspend.sql` se ainda não aplicou (pagamento recusado não suspende mais o tenant automaticamente).
6. No Mercado Pago, configure o webhook apontando para `https://<ref>.supabase.co/functions/v1/mercado-pago-webhook`.

### Validar compra de assinatura com app em `localhost`

- **O webhook não chama seu PC.** O Mercado Pago só fala com a URL pública da Edge Function no Supabase. O front em `http://localhost:8080` continua certo: ele usa o mesmo projeto Supabase; após o pagamento, o banco é atualizado pela function e o `/admin/plano` reflete isso ao recarregar.
- **Simulação “Planos e assinaturas” no painel MP** envia `subscription_preapproval`. O BeautyFlow usa **Checkout Pro** (`checkout/preferences`) e a function `mercado-pago-webhook` só processa notificações de **`payment`** (ID da cobrança em `/v1/payments/:id`). Por isso o teste do painel pode dar **200 OK** sem mudar assinatura — é esperado.
- **Teste de ponta a ponta:** no app local, finalize o checkout (PIX/cartão/boleto de **modo teste**), pague no fluxo do MP. Depois:
  1. **Supabase → Edge Functions → mercado-pago-webhook → Logs:** deve aparecer `processing payment id=...` (não só `ignored`).
  2. Confira `payment_transactions` e `tenant_subscriptions` no SQL Editor.
  3. No app, atualize `/admin/plano`.
- **Secrets:** `MERCADO_PAGO_ACCESS_TOKEN` na Edge Function deve ser o token do **mesmo modo** do pagamento (teste vs produção). Token de produção + pagamento sandbox (ou o inverso) faz o fetch do pagamento falhar ou não bater com o esperado.
- **`ALLOWED_APP_ORIGINS`:** para criar a preferência a partir de `http://localhost:8080`, o código da function já aceita `localhost` / `127.0.0.1` em HTTP; em produção defina a origem real do app.

### Login com Google (OAuth)

1. No Supabase: **Authentication → Providers → Google** — ative o provedor e informe **Client ID** e **Client Secret** do [Google Cloud Console](https://console.cloud.google.com/) (tipo *Web application*).
2. Em **Authentication → URL Configuration**, adicione em **Redirect URLs** todas as URLs exatas para onde o usuário volta após o Google (o Supabase valida isso):
   - Local (este projeto usa porta **8080** por padrão): `http://localhost:8080/cadastro`, `http://localhost:8080/login` (ajuste se o Vite mostrar outra porta).
   - Produção: `https://SEU_DOMINIO/cadastro` e `https://SEU_DOMINIO/login`.
3. No Google Cloud, em **Authorized redirect URIs**, inclua a URL de callback do Supabase: `https://<ref-do-projeto>.supabase.co/auth/v1/callback` (o painel do Supabase em Google provider costuma exibir esse valor).

### Webhook Mercado Pago — assinatura `x-signature` (recomendado em produção)

1. No painel Mercado Pago, ao configurar o webhook, copie o **secret** de assinatura gerado para o app.
2. No Supabase, em **Edge Functions → Secrets** da function `mercado-pago-webhook`, defina `MERCADO_PAGO_WEBHOOK_SECRET` com esse valor.
3. Com o secret definido, a function **exige** cabeçalhos `x-signature` e valida HMAC-SHA256 conforme a [documentação oficial de webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks). Notificações **GET** (IPN legado) sem `x-signature` ainda são aceitas para compatibilidade, com log de aviso.
4. Sem `MERCADO_PAGO_WEBHOOK_SECRET`, o comportamento permanece o anterior (útil em ambientes de teste).

### WhatsApp Meta (Cloud API) — webhook

1. Faça deploy da function `meta-whatsapp-webhook` (`npm run supabase:deploy:meta-whatsapp-webhook` ou `supabase:deploy:all-functions`).
2. Guia de URL, `company_id`, verify token e `META_APP_SECRET`: **`docs/META_WHATSAPP_CLOUD_API.md`**.
