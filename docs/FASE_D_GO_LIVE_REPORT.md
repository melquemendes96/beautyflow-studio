# Fase D — Relatório de blindagem pré-venda

**Data:** 2026-05-20  
**Branch:** `plan-features-safe` (commit após Fase D)

---

## 1. Resumo por etapa

| Etapa | Entregue |
|-------|----------|
| 1 Segurança financeira | Migration + guard SQL `service_role` / `platform_admin` |
| 2 Recuperação de senha | `resetPasswordForEmail`, `/forgot-password`, `/reset-password` |
| 3 Planos fail-closed | `hasFeatureAccess` → `false` se RPC falhar |
| 4 Webhook MP | POST exige `MERCADO_PAGO_WEBHOOK_SECRET` + `x-signature`; logs com `payment_id` |
| 5 UX crítica | Mensagens amigáveis plano/checkout; olho senha já existia em login/cadastro |
| 6 Checklist | `docs/GO_LIVE_CHECKLIST.md` |

---

## 2. Detalhamento (Problema / Arquivo / Mudança / Impacto / Risco)

### E1 — Simulação de pagamento

| Campo | Conteúdo |
|-------|----------|
| **Problema** | Tenant podia aprovar cobrança via RPC sem pagar |
| **Arquivo** | `supabase/migrations/20260518200000_fase_d_go_live_hardening.sql`, `src/routes/admin.plano.tsx` |
| **Mudança** | Função exige `service_role` ou `is_platform_admin()`; UI simulação só `DEV && isPlatformAdmin` |
| **Impacto** | Clientes não ativam plano sem MP/webhook |
| **Risco** | Baixo após migration aplicada |

### E2 — Recuperação de senha

| Campo | Conteúdo |
|-------|----------|
| **Problema** | Página placeholder |
| **Arquivo** | `authService.ts`, `forgot-password.tsx`, `reset-password.tsx`, `password-recovery.ts`, `auth-url.ts`, `public-routes.ts` |
| **Mudança** | Fluxo completo Supabase Auth |
| **Impacto** | Menos tickets de “esqueci senha” |
| **Risco** | Médio se Redirect URL não cadastrada no Supabase |

### E3 — Feature access fail-closed

| Campo | Conteúdo |
|-------|----------|
| **Problema** | Erro RPC liberava recurso por nome do plano |
| **Arquivo** | `src/lib/plan-access.ts` |
| **Mudança** | `return false` se RPC falhar; legado só no SQL (`v_flag_count = 0`) |
| **Impacto** | Sem liberação indevida de WhatsApp/relatórios |
| **Risco** | Baixo |

### E4 — Webhook obrigatório assinado

| Campo | Conteúdo |
|-------|----------|
| **Problema** | POST aceito sem secret |
| **Arquivo** | `supabase/functions/mercado-pago-webhook/index.ts` |
| **Mudança** | Sem secret → 401; sem `x-signature` → 401; log `webhook_unauthorized` |
| **Impacto** | Webhook não processável em prod sem configurar secret |
| **Risco** | **Operacional:** secret obrigatório no deploy |

### E5 — UX mensagens

| Campo | Conteúdo |
|-------|----------|
| **Problema** | Textos técnicos em checkout |
| **Arquivo** | `admin.plano.tsx`, `PublicPlansLoadError.tsx` |
| **Mudança** | Copy “Pagamento pendente”, “Plano ativado”, “Erro ao carregar” |
| **Impacto** | Melhor compreensão do cliente |
| **Risco** | Nenhum |

---

## 3. SQL rollback

Ver `docs/FASE_D_ROLLBACK.sql`.

---

## 4. Arquivos alterados

- `supabase/migrations/20260518200000_fase_d_go_live_hardening.sql` (novo)
- `supabase/functions/mercado-pago-webhook/index.ts`
- `src/lib/plan-access.ts`
- `src/lib/auth-url.ts`
- `src/lib/password-recovery.ts` (novo)
- `src/lib/public-routes.ts`
- `src/services/authService.ts`
- `src/routes/forgot-password.tsx`
- `src/routes/reset-password.tsx` (novo)
- `src/routes/admin.plano.tsx`
- `src/components/site/PublicPlansLoadError.tsx`
- `.env.example`
- `docs/GO_LIVE_CHECKLIST.md` (novo)
- `docs/FASE_D_ROLLBACK.sql` (novo)
- `docs/FASE_D_GO_LIVE_REPORT.md` (novo)

---

## 5. Testes executados

```bash
npm run test:plan-features
npm run test:mercado-pago-env
npm run test:public-booking
npm run build
```

---

## 6. Pós-deploy obrigatório

1. Aplicar migration `20260518200000_fase_d_go_live_hardening.sql`
2. Definir `MERCADO_PAGO_WEBHOOK_SECRET` e redeploy webhook
3. Adicionar `https://jmbeautyflow.tech/reset-password` no Supabase Auth
4. Rodar `docs/GO_LIVE_CHECKLIST.md`
