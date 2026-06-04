# Cron — lembretes WhatsApp 24h

A Edge Function `process-whatsapp-reminders` deve rodar **uma vez por dia** (recomendado entre 08:00 e 10:00, horário de São Paulo).

## O que faz

1. Chama a RPC `enqueue_whatsapp_reminders_due` (service role).
2. Para cada log enfileirado, chama `send-whatsapp-message` com Bearer service role.
3. Só enfileira agendamentos cuja data é **amanhã** (SP) e que já receberam `booking_confirmation` com sucesso.

## Deploy

```bash
npm run supabase:deploy:process-whatsapp-reminders
```

## Secret (recomendado)

No Supabase Dashboard → Edge Functions → Secrets:

| Nome | Valor |
|------|--------|
| `WHATSAPP_CRON_SECRET` | string longa aleatória |

## Invocação manual (teste)

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/process-whatsapp-reminders" \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: <WHATSAPP_CRON_SECRET>" \
  -d "{}"
```

Alternativa: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (menos recomendado expor em cron externo).

## Agendamento

### Opção A — cron externo (VPS, GitHub Actions, etc.)

Agende o `curl` acima diariamente com o secret no header.

### Opção B — Supabase Cron (pg_cron + pg_net)

Se o projeto tiver extensões habilitadas, agende HTTP POST para a URL da function com o header `X-Cron-Secret`. Consulte a documentação atual do Supabase para Cron Jobs no seu plano.

## Pré-requisitos

- Migration `20260522130000_whatsapp_phase_g_h_meta_ops.sql` aplicada.
- Template `booking_reminder` aprovado na Meta e status `approved` em `/admin/whatsapp`.
- Conexão WhatsApp ativa e plano Elite (`whatsapp`).
