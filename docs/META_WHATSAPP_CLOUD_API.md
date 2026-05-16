# BeautyFlow — WhatsApp Business (Meta Cloud API)

Arquitetura oficial: **Meta Cloud API** (não Baileys, não Evolution, não WhatsApp Web).

## Dados e multi-tenant (já existentes)

O schema já inclui:

- `whatsapp_connections` — por `company_id` (único): `phone_number_id`, `business_id`, `webhook_verify_token`, `access_token_encrypted`, `status`, etc.
- `whatsapp_templates`, `whatsapp_message_logs`
- RLS: apenas **owner/admin** da empresa (e master) acessam credenciais (`fase3_rls_policies`).

**Nunca** coloque `access_token` ou `service_role` no frontend (Vite). Tokens de longa duração devem ser gravados via fluxo seguro (ex.: cifrado em `access_token_encrypted` ou Supabase Vault) — a UI `/admin/whatsapp` continua só como orientação até o fluxo de cadastro ser implementado.

## Edge Function `meta-whatsapp-webhook`

Deploy:

```bash
npm run supabase:deploy:meta-whatsapp-webhook
```

URL pública (exemplo):

`https://<ref>.supabase.co/functions/v1/meta-whatsapp-webhook`

### Verificação do webhook (GET)

Cadastre no Meta Developer uma URL **com** o UUID da empresa (multi-tenant):

`https://<ref>.supabase.co/functions/v1/meta-whatsapp-webhook?company_id=<UUID_DA_EMPRESA>`

Na tabela `whatsapp_connections`, preencha `webhook_verify_token` com o **mesmo** token que você informar no painel Meta (campo *Verify Token*). A function compara com `hub.verify_token` e devolve `hub.challenge`.

### Notificações (POST)

Quando o secret **`META_APP_SECRET`** (App Secret do app Meta) estiver definido nas **Secrets** da function, o corpo é validado com `X-Hub-Signature-256` (HMAC-SHA256).

Sem `META_APP_SECRET`, a function aceita o POST e registra **aviso** nos logs — útil só para desenvolvimento.

### Secrets sugeridos (Supabase → Edge Functions → Secrets)

| Secret | Obrigatório | Uso |
|--------|-------------|-----|
| `SUPABASE_URL` | sim (geralmente automático) | Client service role |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Ler `whatsapp_connections` na verificação GET |
| `META_APP_SECRET` | **fortemente recomendado em produção** | Validação `X-Hub-Signature-256` |

Não duplicar o App Secret no repositório.

## Próximos passos de produto (não implementados aqui)

- Enfileirar envio de mensagens (confirmação / lembrete) respeitando políticas da Meta e opt-in do cliente.
- Registrar inbound em `whatsapp_message_logs`.
- Fluxo UI para salvar credenciais com RLS (apenas admin da empresa).

## Referência

- [WhatsApp Cloud API — Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
