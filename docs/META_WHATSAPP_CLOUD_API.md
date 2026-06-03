# BeautyFlow — WhatsApp Business (Meta Cloud API)

Arquitetura oficial: **Meta Cloud API** (Fases B–F implementadas na branch `feature/whatsapp-meta-integration`).

## Admin (`/admin/whatsapp`)

- RPC `save_whatsapp_connection` — grava credenciais (token nunca retornado ao browser).
- RPC `get_whatsapp_connection` — leitura segura + URL do webhook com `company_id`.
- RPC `list_whatsapp_templates` / `seed_whatsapp_templates_defaults` / `upsert_whatsapp_template`.
- Métricas: `get_whatsapp_message_stats`.

Requer plano com feature `whatsapp` (Elite).

## Edge Functions

| Function | Deploy | JWT |
|----------|--------|-----|
| `meta-whatsapp-webhook` | `npm run supabase:deploy:meta-whatsapp-webhook` | `verify_jwt = false` |
| `send-whatsapp-message` | `npm run supabase:deploy:send-whatsapp-message` | `verify_jwt = false` |

Ambas: `npm run supabase:deploy:whatsapp`

### Webhook URL (GET + POST)

```
https://<ref>.supabase.co/functions/v1/meta-whatsapp-webhook?company_id=<UUID_DA_EMPRESA>
```

**Verify token:** `whatsapp_connections.webhook_verify_token` ou secret `VERIFY_TOKEN`.

POST: valida `X-Hub-Signature-256` com `META_APP_SECRET`; grava inbound/status em `whatsapp_message_logs`.

### Envio pós-agendamento

1. Cliente marca opt-in em `/agendar/{slug}` (se empresa com WhatsApp ativo).
2. `create_public_booking(..., p_whatsapp_notifications)` enfileira log `pending`.
3. Front chama `send-whatsapp-message` com `appointment_id`.
4. Webhook atualiza `delivered` / `read` / `failed`.

Templates: ver [WHATSAPP_TEMPLATES.md](./WHATSAPP_TEMPLATES.md).

## Migration

Aplicar no Supabase:

`supabase/migrations/20260522100000_whatsapp_phases_b_f.sql`

## Secrets (Edge Functions)

| Secret | Uso |
|--------|-----|
| `META_APP_SECRET` | Assinatura webhook POST |
| `VERIFY_TOKEN` | Fallback GET |
| `WHATSAPP_TOKEN` | Fallback envio |
| `PHONE_NUMBER_ID` / `WABA_ID` | Fallback resolução tenant |

Não commitar valores no repositório.

## Referência

- [WhatsApp Cloud API — Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
