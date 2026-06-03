# Templates WhatsApp (Meta Cloud API)

Crie no **Meta Business Manager → WhatsApp → Message templates** os modelos abaixo em `pt_BR`. Depois marque como **approved** em `/admin/whatsapp`.

## booking_confirmation

**Nome na Meta:** `booking_confirmation`  
**Categoria:** Utility (ou Marketing, conforme política)  
**Idioma:** Portuguese (BR)

**Corpo sugerido:**

```text
Olá {{1}}, seu agendamento de {{2}} está confirmado para {{3}} às {{4}}. Até lá!
```

**Variáveis (ordem enviada pela Edge `send-whatsapp-message`):**

| Posição | Conteúdo        |
|---------|-----------------|
| {{1}}   | Nome do cliente |
| {{2}}   | Nome do serviço |
| {{3}}   | Data (DD/MM/AAAA) |
| {{4}}   | Horário (HH:MM) |

## booking_reminder (Fase G)

**Nome na Meta:** `booking_reminder`

```text
Olá {{1}}, lembrete: amanhã você tem {{2}} às {{3}}. Qualquer dúvida, responda esta mensagem.
```

| Posição | Conteúdo        |
|---------|-----------------|
| {{1}}   | Nome do cliente |
| {{2}}   | Nome do serviço |
| {{3}}   | Horário         |

## Webhook (por empresa)

```
https://<ref>.supabase.co/functions/v1/meta-whatsapp-webhook?company_id=<UUID_DA_EMPRESA>
```

**Verify token:** mesmo valor de `webhook_verify_token` em `whatsapp_connections` (ou secret `VERIFY_TOKEN`).

## Secrets (Edge Functions)

| Secret | Uso |
|--------|-----|
| `META_APP_SECRET` | Assinatura webhook POST |
| `VERIFY_TOKEN` | Fallback GET verificação |
| `WHATSAPP_TOKEN` | Fallback envio se token não estiver no banco |
| `PHONE_NUMBER_ID` / `WABA_ID` | Fallback resolução de tenant |

O token principal deve ser salvo em **Admin → WhatsApp** (RPC `save_whatsapp_connection`).
