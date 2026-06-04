# BeautyFlow — WhatsApp Business (Meta Cloud API)

Arquitetura oficial: **Meta Cloud API** (Fases B–H: confirmação, lembretes 24h, logs admin, checklist).

## Admin (`/admin/whatsapp`)

- RPC `save_whatsapp_connection` — grava credenciais (token nunca retornado ao browser).
- RPC `get_whatsapp_connection` — leitura segura + URL do webhook com `company_id`.
- RPC `list_whatsapp_templates` / `seed_whatsapp_templates_defaults` / `upsert_whatsapp_template`.
- Métricas: `get_whatsapp_message_stats`.
- Histórico: `list_whatsapp_message_logs`.
- Checklist Meta: `get_whatsapp_setup_status`.
- Botão **Testar conexão Meta** → Edge `verify-whatsapp-connection`.

Requer plano com feature `whatsapp` (Elite).

## Edge Functions

| Function | Deploy | JWT |
|----------|--------|-----|
| `meta-whatsapp-webhook` | `npm run supabase:deploy:meta-whatsapp-webhook` | `verify_jwt = false` |
| `send-whatsapp-message` | `npm run supabase:deploy:send-whatsapp-message` | `verify_jwt = false` (auth via `send_token`, admin JWT ou service role) |
| `process-whatsapp-reminders` | `npm run supabase:deploy:process-whatsapp-reminders` | `verify_jwt = false` (cron: `X-Cron-Secret` ou service role) |
| `verify-whatsapp-connection` | `npm run supabase:deploy:verify-whatsapp-connection` | `verify_jwt = true` |

Todas WhatsApp: `npm run supabase:deploy:whatsapp`

### Webhook URL (GET + POST)

```
https://<ref>.supabase.co/functions/v1/meta-whatsapp-webhook?company_id=<UUID_DA_EMPRESA>
```

**Verify token:** `whatsapp_connections.webhook_verify_token` ou secret `VERIFY_TOKEN`.

POST: valida `X-Hub-Signature-256` com `META_APP_SECRET`; grava inbound/status em `whatsapp_message_logs`.

### Envio pós-agendamento

1. Cliente marca opt-in em `/agendar/{slug}` (se empresa com WhatsApp ativo).
2. `create_public_booking(..., p_whatsapp_notifications)` enfileira log `pending`.
3. Front chama `send-whatsapp-message` com `appointment_id`, `whatsapp_log_id` e `whatsapp_send_token` (token único da RPC).
4. Webhook atualiza `delivered` / `read` / `failed`.

Chamadas sem `send_token` retornam **401**, exceto owner/admin autenticado da empresa (header Authorization).

Templates: ver [WHATSAPP_TEMPLATES.md](./WHATSAPP_TEMPLATES.md).

### Lembretes 24h (Fase G)

1. Cron diário chama `process-whatsapp-reminders` (ver [WHATSAPP_CRON.md](./WHATSAPP_CRON.md)).
2. RPC `enqueue_whatsapp_reminders_due` enfileira agendamentos de **amanhã** (timezone `America/Sao_Paulo`) que já tiveram `booking_confirmation`.
3. A Edge dispara `send-whatsapp-message` com service role e template `booking_reminder` (3 variáveis).

## Migration

Aplicar no Supabase (ordem):

1. `supabase/migrations/20260522100000_whatsapp_phases_b_f.sql`
2. `supabase/migrations/20260522120000_audit_phase1_2_whatsapp_auth_public_eligibility.sql` (se ainda não aplicada)
3. `supabase/migrations/20260522130000_whatsapp_phase_g_h_meta_ops.sql`

## Secrets (Edge Functions)

| Secret | Uso |
|--------|-----|
| `META_APP_SECRET` | Assinatura webhook POST |
| `VERIFY_TOKEN` | Fallback GET |
| `WHATSAPP_TOKEN` | Fallback envio |
| `PHONE_NUMBER_ID` / `WABA_ID` | Fallback resolução tenant |
| `WHATSAPP_CRON_SECRET` | Header `X-Cron-Secret` no cron de lembretes (recomendado) |

Não commitar valores no repositório.

## Referência

- [WhatsApp Cloud API — Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
