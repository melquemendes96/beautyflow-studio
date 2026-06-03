# JM BeautyFlow — Fluxograma integração WhatsApp Meta (Cloud API)

**Uso no Canva:** copie cada bloco `mermaid` em https://mermaid.live → Export PNG/SVG → importe no Canva.

**Branch de trabalho:** `feature/whatsapp-meta-integration`  
**Checkpoint rollback:** tag Git `pre-whatsapp-2026-05-22`  
**Estado atual do código:** schema + webhook esqueleto; envio automático **não** implementado

---

## Legenda

| Item | Significado |
|------|-------------|
| Verde no produto | Já existe no banco ou no código base |
| Tracejado | A implementar na Fase WhatsApp |
| Elite | Plano com feature `whatsapp` via `plan_features` |

---

## 1. Arquitetura alvo (visão geral)

```mermaid
flowchart TB
  subgraph Meta["Meta Facebook"]
    WABA[WhatsApp Business Account]
    CloudAPI[Cloud API]
    Templates[Templates aprovados Meta]
  end

  subgraph BeautyFlow["BeautyFlow"]
    AdminUI["/admin/whatsapp"]
    Booking["create_public_booking RPC"]
    EdgeSend["Edge send-whatsapp-message<br/>A IMPLEMENTAR"]
    EdgeHook["Edge meta-whatsapp-webhook<br/>PARCIAL"]
    DB[(Supabase Postgres)]
  end

  subgraph Cliente["Cliente"]
    Phone[WhatsApp do cliente]
  end

  AdminUI -->|salva credenciais RPC| DB
  Booking -->|dispara envio| EdgeSend
  EdgeSend -->|POST messages| CloudAPI
  CloudAPI --> Phone
  Phone -->|resposta status| CloudAPI
  CloudAPI -->|webhook POST| EdgeHook
  EdgeHook -->|logs status| DB
  WABA --> CloudAPI
  Templates --> CloudAPI
```

---

## 2. Fases da integração (roadmap)

```mermaid
flowchart TD
  Start([Início Fase WhatsApp]) --> Git[Branch feature/whatsapp-meta-integration]
  Git --> P0{Plano Elite + feature whatsapp ON?}
  P0 -->|não| P0fix[Ajustar plan_features no master]
  P0fix --> P0
  P0 -->|sim| A[Fase A: App Meta + WABA + número teste]

  A --> B[Fase B: Credenciais por empresa]
  B --> C[Fase C: Webhook GET verificado]
  C --> D[Fase D: Webhook POST + logs inbound]
  D --> E[Fase E: Templates Meta aprovados]
  E --> F[Fase F: Envio confirmação pós-agendamento MVP]
  F --> G[Fase G: Lembretes 24h antes]
  G --> H[Fase H: UI admin completa + métricas]
  H --> I[Fase I: Produção merge main]

  F -.->|problema| Rollback[Tag pre-whatsapp-2026-05-22]
```

---

## 3. Estado ATUAL vs FUTURO

```mermaid
flowchart LR
  subgraph Hoje["HOJE no sistema"]
    H1[whatsapp_connections tabela]
    H2[meta-whatsapp-webhook GET OK]
    H3[POST retorna processed false]
    H4[/admin/whatsapp placeholder]
    H5[wa.me no branding manual]
  end

  subgraph Futuro["META integração"]
    F1[Salvar token cifrado por empresa]
    F2[Enviar template confirmação]
    F3[Lembrete automático]
    F4[Logs whatsapp_message_logs]
    F5[Opt-in na página agendar]
  end

  Hoje -.->|Fase B a I| Futuro
```

---

## 4. Onboarding WhatsApp por tenant

```mermaid
flowchart TD
  T1[Empresa com plano Elite] --> T2[feature whatsapp = true]
  T2 --> T3[Admin abre /admin/whatsapp]
  T3 --> T4[Preenche Business ID Phone Number ID verify token]
  T4 --> T5[Backend seguro salva whatsapp_connections]
  T5 --> T6[Cadastra webhook Meta com company_id na URL]
  T6 --> T7[GET hub.challenge status active]
  T7 --> T8[Pronto para enviar mensagens]
```

**URL webhook (por empresa):**

`https://rfdphonjgsmyeqnsfjom.supabase.co/functions/v1/meta-whatsapp-webhook?company_id=UUID_DA_EMPRESA`

---

## 5. Credenciais (Fase B) — sequência

```mermaid
sequenceDiagram
  participant Admin as Admin /admin/whatsapp
  participant API as Edge ou RPC seguro
  participant DB as whatsapp_connections

  Admin->>API: business_id phone_number_id verify_token
  Note over Admin,API: Access token NUNCA no browser Vite
  API->>API: Cifrar token access_token_encrypted
  API->>DB: UPSERT status pending ou active
  API-->>Admin: OK + status conexão
```

**Campos no banco:** `business_id`, `phone_number_id`, `display_phone_number`, `webhook_verify_token`, `access_token_encrypted`, `status`

---

## 6. Webhook verificação GET (Fase C) — já existe

```mermaid
flowchart TD
  Meta[Meta Developer cadastra URL] --> GET[GET meta-whatsapp-webhook]
  GET --> Q{hub.mode subscribe?}
  Q -->|sim| DB[Lê webhook_verify_token da empresa]
  DB --> Match{Token igual?}
  Match -->|sim| Challenge[Retorna hub.challenge 200]
  Match -->|não| Forbidden[403]
```

---

## 7. Webhook POST inbound (Fase D) — a completar

```mermaid
flowchart LR
  MP[Meta POST webhook] --> Sig{X-Hub-Signature-256 OK?}
  Sig -->|não| E401[401 ou 403 + log]
  Sig -->|sim| Parse[Parse entry changes]
  Parse --> Inbound{tipo evento}
  Inbound -->|mensagem cliente| LogIn[whatsapp_message_logs inbound]
  Inbound -->|status sent delivered read| LogSt[atualizar log outbound]
  Inbound -->|outro| Ignore[webhook_ignored log]
```

**Secrets:** `META_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

---

## 8. Templates Meta (Fase E)

```mermaid
flowchart TD
  E1[Criar templates no Meta Business Manager pt_BR] --> E2[booking_confirmation]
  E1 --> E3[booking_reminder]
  E2 --> E4[Aguardar aprovação Meta]
  E3 --> E4
  E4 --> E5[Espelhar em whatsapp_templates status approved]
  E5 --> E6[UI admin lista templates]
```

---

## 9. Confirmação pós-agendamento MVP (Fase F)

```mermaid
flowchart TD
  Book[Cliente confirma em /agendar/slug] --> RPC[create_public_booking]
  RPC -->|ok + appointment_id| Check{Plano tem whatsapp ON?}
  Check -->|não| End1[Fim sem envio]
  Check -->|sim| Conn{whatsapp_connections active?}
  Conn -->|não| End2[Log not_configured]
  Conn -->|sim| Opt{Cliente opt-in WhatsApp?}
  Opt -->|não| End3[Fim sem envio]
  Opt -->|sim| Queue[whatsapp_message_logs pending]
  Queue --> Worker[Edge send-whatsapp-message]
  Worker --> MetaAPI[POST Cloud API template]
  MetaAPI --> LogOk[sent + meta_message_id]
  MetaAPI -->|erro| LogErr[failed + error_message]
  MetaAPI --> Hook[Webhook atualiza delivered/read]
```

---

## 10. Lembrete 24h (Fase G)

```mermaid
flowchart TD
  Cron[Job cron ou pg_cron] --> Q[appointments em 24h]
  Q --> R{Já enviou reminder?}
  R -->|sim| Skip[Pular]
  R -->|não| Send[Template booking_reminder]
  Send --> Log[whatsapp_message_logs]
  Q --> Block{Empresa suspensa ou past_due?}
  Block -->|sim| Skip
```

---

## 11. Git — como salvar durante a integração

```mermaid
flowchart LR
  W1[git checkout feature/whatsapp-meta-integration] --> W2[Desenvolver Fase B C D...]
  W2 --> W3[git commit feat whatsapp]
  W3 --> W4[git push origin feature/whatsapp-meta-integration]
  W4 --> W5{Não push main até MVP}
  W5 --> W6[Merge PR quando Fase I OK]
```

---

## 12. Rollback se der problema

```mermaid
flowchart TD
  Problem[Integração quebrou produção] --> R1[git checkout pre-whatsapp-2026-05-22]
  R1 --> R2[npm ci + npm run build]
  R2 --> R3[Redeploy VPS]
  R3 --> R4{BD alterado?}
  R4 -->|sim| R5[Restore Supabase backup PITR]
  R4 -->|não| OK[Sistema SaaS estável de volta]
```

---

## Checklist resumido

### Fase 0 — Git
- [ ] Branch `feature/whatsapp-meta-integration`
- [ ] Push só nessa branch

### Fase A — Meta
- [ ] App Developers + produto WhatsApp
- [ ] WABA + Phone Number ID
- [ ] `META_APP_SECRET` no Supabase

### Fase B — Credenciais
- [ ] RPC/Edge salvar `whatsapp_connections`
- [ ] UI `/admin/whatsapp` formulário

### Fase C — Webhook GET
- [ ] URL com `company_id` verificada no Meta

### Fase D — Webhook POST
- [ ] Gravar `whatsapp_message_logs`
- [ ] Assinatura HMAC em produção

### Fase E — Templates
- [ ] `booking_confirmation` aprovado

### Fase F — MVP
- [ ] Opt-in no agendar
- [ ] Envio após `create_public_booking`
- [ ] Teste celular real

### Fase G–I
- [ ] Lembretes
- [ ] Dashboard métricas
- [ ] Merge `main` + deploy

---

## Sprints sugeridos

| Sprint | Entrega |
|--------|---------|
| S1 | Fase B + C — conectar + webhook verificado |
| S2 | Fase D + E — inbound + templates |
| S3 | Fase F — confirmação agendamento |
| S4 | Fase G + H — lembretes + UI |
| S5 | Fase I — produção |

---

*Arquivo local — pasta `docs/export-canva/` — uso Canva / documentação.*
