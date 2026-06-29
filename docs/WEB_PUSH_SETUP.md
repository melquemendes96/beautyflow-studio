# Web Push — notificações na barra do celular (iOS / Android)

## 1. Gerar chaves VAPID

```bash
node scripts/generate-vapid-keys.mjs
```

## 2. Variáveis

**`.env` (build do site / VPS):**

```
VITE_VAPID_PUBLIC_KEY=...
```

**Supabase → Edge Functions → Secrets:**

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:suporte@seu-dominio.com
PUSH_INTERNAL_SECRET=<string longa aleatória>
```

## 3. Migration

Aplique `supabase/migrations/20260617000000_web_push_pwa.sql` no SQL Editor ou `supabase db push`.

## 4. Deploy da Edge Function

```bash
npx supabase functions deploy deliver-web-push
```

## 5. Configurar URL + secret no banco

Edite e execute `supabase/scripts/setup_web_push_prod.sql` no SQL Editor.

Isso permite que os triggers SQL chamem a função `deliver-web-push` via `pg_net`.

## 6. Uso no app

1. Admin ou equipe abre o painel no celular (ou instala PWA).
2. Toque no ícone de sino riscado → **Ativar notificações**.
3. Aceite a permissão do sistema.

Eventos que disparam push:

- Novo agendamento (público ou admin)
- Cancelamento de agendamento
- Pagamento confirmado (`payment_transactions.status = paid`)

## iOS

- Requer **iOS 16.4+**
- App deve estar **Adicionado à Tela de Início** (Safari)
- Permissão de notificações no app instalado

## Android

- Chrome + PWA instalado ou site com service worker
- Permissão de notificações ao ativar no painel (ícone de sino no topo)
- **Ative as notificações** — sem isso só funciona o sino com o app aberto
- Pagamentos usam som de caixa na barra do sistema (quando suportado pelo Chrome)

## Entrega com app fechado

Os triggers SQL enfileiram e chamam `deliver-web-push` via `pg_net`. A migration
`20260617010000_push_delivery_reliability.sql` adiciona cron de backup (1 min).

Confirme `platform_push_config` com `url_ok` e `secret_ok` após `setup_web_push_prod.sql`.
