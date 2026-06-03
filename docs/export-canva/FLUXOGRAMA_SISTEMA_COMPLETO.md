# JM BeautyFlow — Fluxograma do sistema completo (estado atual)

**Uso no Canva:** copie cada bloco `mermaid` em https://mermaid.live → Export PNG/SVG → importe no Canva.

**Data de referência:** maio/2026 · produção `jmbeautyflow.tech` · Supabase `rfdphonjgsmyeqnsfjom`

---

## Legenda

| Ator | Descrição |
|------|-----------|
| Visitante | Não logado — home, planos, cadastro |
| Admin (tenant) | Dono do studio — painel `/admin` |
| Cliente final | Agenda em `/agendar/:slug` |
| Master | Plataforma — `/master/*` |
| Mercado Pago | Checkout e webhooks de assinatura |
| Supabase | Auth, Postgres, Edge Functions |
| VPS | Hospeda o front SSR (PM2 + Nginx) |

---

## 1. Ecossistema macro

```mermaid
flowchart TB
  subgraph Internet["Usuários"]
    V[Visitante]
    D[Dono do studio / Admin]
    C[Cliente final]
    M[Master plataforma]
  end

  subgraph VPS["VPS Hostinger"]
    WEB["jmbeautyflow.tech<br/>React + TanStack Router SSR"]
  end

  subgraph Supa["Supabase Cloud"]
    AUTH[Auth JWT]
    DB[(Postgres multi-tenant)]
    EF1[Edge: create-mercado-pago-preference]
    EF2[Edge: mercado-pago-webhook]
    EF3[Edge: meta-whatsapp-webhook<br/>esqueleto]
  end

  MP[Mercado Pago]

  V --> WEB
  D --> WEB
  C --> WEB
  M --> WEB

  WEB --> AUTH
  WEB --> DB
  WEB --> EF1

  EF1 --> MP
  MP --> EF2
  EF2 --> DB

  WEB -.->|futuro WhatsApp| EF3
  EF3 -.-> DB
```

---

## 2. Jornada completa (marketing → operação)

```mermaid
flowchart LR
  subgraph P1["1. Marketing"]
    A1["/ Home"] --> A2["/plans ou #planos"]
    A2 --> A3["/cadastro?planId"]
    A1 --> A4["/demo"]
    A1 --> A5["/login"]
  end

  subgraph P2["2. Conta e empresa"]
    A3 --> B1["Supabase Auth<br/>email ou Google"]
    B1 --> B2["/auth/callback"]
    B2 --> B3{"Tem empresa?"}
    B3 -->|não| B4["/onboarding/company"]
    B4 --> B5["RPC bootstrap empresa"]
    B3 -->|sim| B6["post-login routing"]
  end

  subgraph P3["3. Plano e pagamento"]
    B6 --> C1{"Assinatura OK?"}
    C1 -->|não| C2["/billing/plans ou<br/>/admin/plano"]
    C2 --> C3["company_start_checkout"]
    C3 --> C4["Mercado Pago Checkout"]
    C4 --> C5["Webhook MP"]
    C5 --> C6["assinatura active"]
    C1 -->|sim| C7["/admin"]
  end

  subgraph P4["4. Operação studio"]
    C7 --> D1["Serviços / Branding / Agenda"]
    D1 --> D2["Link público /agendar/slug"]
  end

  subgraph P5["5. Cliente final"]
    D2 --> E1["/agendar/:slug"]
    E1 --> E2["create_public_booking"]
    E2 --> E3["appointments + agenda admin"]
    E3 --> E4["/cliente portal"]
  end

  subgraph P6["6. Master"]
    M1["/login master"] --> M2["/master/empresas"]
    M2 --> M3["planos / assinaturas / pagamentos"]
  end
```

---

## 3. Autenticação e roteamento pós-login

```mermaid
flowchart TD
  Start([Login / Cadastro / OAuth]) --> Auth[Supabase Auth sessão JWT]
  Auth --> Profile[loadAuthProfile + ensureProfile]
  Profile --> Q1{platform_admin ou<br/>email master?}

  Q1 -->|sim| Master["/master/empresas"]
  Q1 -->|não| Q2{company_users<br/>vazio?}

  Q2 -->|sim| Onboard["/onboarding/company"]
  Q2 -->|não| Q3{company.status<br/>suspended?}

  Q3 -->|sim| BillSus["/billing/plans?billing=suspended"]
  Q3 -->|não| Q4{tenant_subscriptions<br/>active ou trialing?}

  Q4 -->|não| Bill["/billing/plans ou /admin/plano"]
  Q4 -->|sim| Admin["/admin dashboard"]

  Onboard --> Bootstrap[RPC criar company + membership]
  Bootstrap --> Bill

  Admin --> Guards[Guards em /admin/*]
  Guards --> G1{billing exempt path?}
  G1 -->|plano checkout config servicos| OK1[Acesso parcial]
  G1 -->|outras rotas| G2{assinatura válida?}
  G2 -->|não| Bill
  G2 -->|sim| G3{rota exige feature?<br/>branding waitlist reports whatsapp}
  G3 -->|sem feature| Upgrade["/admin/plano?billing=upgrade"]
  G3 -->|ok| OK2[Página liberada]
```

---

## 4. Cadastro self-serve (novo tenant)

```mermaid
flowchart TD
  C0["/cadastro + planId na URL"] --> C1[Formulário dados + plano]
  C1 --> C2[signUp Supabase]
  C2 --> C3[completeSignupOnboarding RPC]
  C3 --> C4[Cria company slug + company_users owner]
  C4 --> C5[Vincula plano tenant_subscriptions]
  C5 --> C6{Trial ou pagar?}
  C6 -->|trial| C7[status trialing]
  C6 -->|pagar| C8[company_start_checkout]
  C8 --> C9[Preferência Mercado Pago]
  C9 --> C10[Webhook aprova]
  C10 --> C11[service_apply_payment_renewal]
  C11 --> C12["/admin"]
  C7 --> C12
```

---

## 5. Cobrança Mercado Pago

```mermaid
sequenceDiagram
  participant Admin as Admin /admin/plano
  participant App as Frontend BeautyFlow
  participant EF as Edge create-mercado-pago-preference
  participant DB as Postgres
  participant MP as Mercado Pago
  participant WH as Edge mercado-pago-webhook

  Admin->>App: Escolhe plano / checkout
  App->>DB: company_start_checkout
  Note over DB: payment_transactions pending<br/>tenant_subscriptions
  App->>EF: Criar preferência payment_id
  EF->>MP: POST checkout/preferences
  MP-->>Admin: Redirect checkout MP
  Admin->>MP: Paga cartão ou PIX
  MP->>WH: Webhook payment approved
  WH->>MP: GET /v1/payments/:id
  WH->>DB: RPC service_apply_payment_renewal
  Note over DB: payment paid<br/>subscription active
  WH->>DB: payment_logs
  Admin->>App: Retorno checkout=success
```

---

## 6. Agendamento público → agenda admin

```mermaid
flowchart TD
  L["Link /agendar/ma-barbearia"] --> H[Carrega branding + serviços]
  H --> S1[Cliente escolhe serviço]
  S1 --> S2[Data e horário get_available_slots]
  S2 --> S3[Dados nome email whatsapp]
  S3 --> S4[create_public_booking RPC]
  S4 --> DB1[(clients upsert)]
  S4 --> DB2[(appointments insert)]
  S4 --> OK[Tela confirmação + calendário .ics]
  OK --> P["/cliente?slug e auto=1"]
  DB2 --> ADM["/admin/agenda"]
  ADM --> BL[Bloqueios schedule_blocks<br/>refletem nos slots públicos]
```

---

## 7. Portal do cliente

```mermaid
flowchart TD
  P0["/cliente"] --> P1{sessionStorage slug<br/>ou query slug}
  P1 -->|sem slug| Erro[Pedir link do studio]
  P1 -->|ok| P2[get_client_portal_data RPC]
  P2 --> P3[Próximos atendimentos]
  P2 --> P4[Histórico]
  P3 --> P5[Cancelar avaliar reagendar RPCs]
  P5 --> P6["/agendar/slug?reagendar=id"]
```

---

## 8. Painel Admin (módulos)

```mermaid
flowchart TB
  ADM["/admin"] --> I[index dashboard]
  ADM --> AG[agenda]
  ADM --> SV[servicos]
  ADM --> CL[clientes]
  ADM --> CF[configuracoes]
  ADM --> PL[plano checkout MP]
  ADM --> BR[branding plano Pro+]
  ADM --> WL[lista-espera Pro+]
  ADM --> RP[relatorios Pro+]
  ADM --> WA[whatsapp Elite placeholder]
  ADM --> NT[notificações sino]
```

---

## 9. Painel Master

```mermaid
flowchart LR
  M0["/master"] --> M1[empresas]
  M0 --> M2[planos + feature toggles]
  M0 --> M3[assinaturas]
  M0 --> M4[pagamentos]
  M0 --> M5[inadimplentes renovações]
  M0 --> M6[suporte]
  M0 --> M7[cupons configuracoes]

  M2 --> DB[(plans plan_features)]
  M1 --> DB2[(companies subscriptions)]
  M4 --> DB3[(payments payment_logs)]
```

---

## 10. WhatsApp hoje (apenas manual)

```mermaid
flowchart LR
  WA1["/admin/whatsapp placeholder"] --> WA2[sem envio API]
  WA3["Branding link wa.me"] --> Cliente[WhatsApp manual]
  WA4["meta-whatsapp-webhook"] --> WA5[GET OK POST não processa]
```

---

## 11. Deploy produção

```mermaid
flowchart TB
  Dev[PC Cursor] -->|git push| GH[GitHub]
  GH --> VPS[VPS git pull npm build]
  VPS --> PM2[PM2 srvx porta 3000]
  PM2 --> NG[Nginx HTTPS]
  NG --> User[jmbeautyflow.tech]
  GH -.->|migrations SQL| Supa[(Supabase)]
  Supa --> EF[Edge Functions]
```

---

## Fluxo linear simplificado (uma linha para Canva)

```
Visitante → Home/Plans → Cadastro ou Login → Auth Supabase
  → Sem empresa? Onboarding → Sem assinatura? Mercado Pago → /admin
  → Link /agendar/:slug → Cliente agenda → Agenda admin + /cliente
  (Paralelo: Master gerencia empresas e planos)
```

---

## Rotas principais

| Área | Rotas |
|------|--------|
| Público | `/`, `/plans`, `/cadastro`, `/login`, `/demo` |
| Auth | `/auth/callback`, `/forgot-password`, `/reset-password` |
| Onboarding | `/onboarding/company` |
| Billing | `/billing/plans`, `/billing/checkout`, `/admin/plano`, `/admin/plano/checkout` |
| Admin | `/admin`, `/admin/agenda`, `/admin/servicos`, `/admin/clientes`, `/admin/branding`, … |
| Cliente | `/agendar/:slug`, `/cliente` |
| Master | `/master/empresas`, `/master/planos`, `/master/pagamentos`, … |

---

## O que não entra no fluxo ativo hoje

- Envio automático WhatsApp Cloud API (só placeholder + `wa.me` no branding)
- Pagamento simulado em produção (só `DEV`)
- Fallback fake de planos (só Supabase `list_public_plans`)

---

*Arquivo local — pasta `docs/export-canva/` — uso Canva / documentação.*
