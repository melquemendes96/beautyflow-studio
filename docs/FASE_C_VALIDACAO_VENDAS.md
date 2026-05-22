# Fase C — Validação final para vendas reais

**Data:** 2026-05-20  
**Branch analisada:** `plan-features-safe` (inclui Fase A `pre-venda-safe` + Fase B feature flags)  
**Produção referência:** https://jmbeautyflow.tech  

---

## Status final

### **Condicionalmente pronto para as primeiras vendas**

O código e o build estão em condição de ir para produção **após** o checklist de deploy abaixo.  
A validação **E2E com login real, pagamento MP e banco em produção** não foi executada nesta sessão (sem credenciais `.env` / contas no ambiente do agente).

| Área | Resultado |
|------|-----------|
| Build produção + `verify-production-build` | **OK** |
| Testes unitários (`plan-features`, `public-booking`) | **OK** |
| Revisão de código (fluxos, guards, RLS no client) | **OK** |
| Smoke HTTP produção (home, cadastro, agendar) | **Parcial** (páginas respondem; dados Supabase exigem browser) |
| Login master / admin MA | **Pendente manual** |
| Checkout MP + `payment_logs` + assinatura | **Pendente manual** |
| Migration Fase B (`plan_features`) em produção | **Pendente** (aplicar antes de deploy da branch B) |

**Veredito:** pode vender **depois** de: (1) merge/deploy da stack validada, (2) migrations no Supabase, (3) smoke manual de 30–45 min com as contas abaixo.

---

## O que foi testado (automático / estático)

| Item | Método | Resultado |
|------|--------|-----------|
| Build limpo | `npm run build` + `verify-production-build.mjs` | Passou |
| Sem `sb_publishable_` no `dist` | Script pós-build | Passou |
| Sem `authLoading` no chunk cadastro | Script pós-build | Passou |
| Sem `role: "master"` no bundle client | Script pós-build | Passou |
| Fallback legado de planos | `npm run test:plan-features` | Passou |
| Slug agendamento público | `npm run test:public-booking` | Passou |
| Home → link cadastro com `planId` | Código `index.tsx` | Implementado |
| Planos sem fallback fake | `fetch-public-plans.ts` | Só Supabase |
| Pagamento simulado só DEV | `admin.plano.tsx` + `import.meta.env.DEV` | Correto |
| Webhook grava `payment_logs` | `mercado-pago-webhook/index.ts` | Implementado |
| Gates feature flags | `route-guards.ts` + `hasFeatureAccess` | Implementado |
| Master não envia role PG `master` | `masterService.ts` | Documentado + erros amigáveis |
| Serviços filtram `company_id` | `*Service.ts` | Padrão consistente |
| Produção HTTP | GET `/`, `/cadastro`, `/agendar/ma-barbearia` | 200; cadastro com UI; agendar SSR “Carregando…” |

---

## Checklist obrigatório — status por item

Marque na VPS/Supabase após deploy. Legenda: ✅ validado no código/automação · ⏳ requer teste manual · ⚠️ depende de migration/deploy.

### 1. Visitante

| Passo | Status | Notas |
|-------|--------|-------|
| Abre home | ⏳ | Site produção carrega; seção planos é CSR — confirmar cards com preços reais no browser |
| Vê planos reais | ⏳ | RPC `list_public_plans` ou `plans` active; sem fallback inventado (Fase A) |
| Clica Começar agora | ✅ | `Link` → `/cadastro?planId=...` |
| Vai para cadastro | ✅ | Rota `/cadastro` OK em produção (HTML) |

### 2. Cadastro

| Passo | Status | Notas |
|-------|--------|-------|
| Cria empresa | ⏳ | `completeSignupOnboarding` / `ensureUserCompanyBootstrap` |
| Escolhe plano | ⏳ | UI planos no cadastro; `planId` na URL |
| Cria admin | ⏳ | Auth + `company_users` |
| Entra no painel | ⏳ | `runPostLoginNavigation` → `/admin` ou billing |

### 3. Login

| Passo | Status | Notas |
|-------|--------|-------|
| `melquemendes96@gmail.com` → master | ⏳ | `platform_admins` + email em `MASTER_EMAILS` |
| `melquebaruch@gmail.com` → MA Barbearia | ⏳ | Membership `company_users`; não master |

### 4. Master

| Passo | Status | Notas |
|-------|--------|-------|
| Vê empresas | ⏳ | `/master/empresas` |
| Vê planos | ⏳ | `/master/planos` |
| Edita planos | ⏳ | Nome/preço/active |
| Toggles recursos | ⚠️ | Requer migration `20260518100000_plan_features_catalog.sql` |

### 5. Empresa (MA Barbearia)

| Passo | Status | Notas |
|-------|--------|-------|
| Cadastra serviço | ⏳ | `/admin/servicos` (billing exempt) |
| Configura marca | ⏳ | `/admin/branding` — exige feature ON (Studio Pro+) |
| Agenda funciona | ⏳ | `/admin/agenda` |
| Link público | ⏳ | `/agendar/ma-barbearia` |

### 6. Cliente final

| Passo | Status | Notas |
|-------|--------|-------|
| `/agendar/ma-barbearia` | ⏳ | Sem gate de plano no visitante |
| Serviço → data → horário → confirma | ⏳ | RPC slots + create booking |

### 7. Pagamento

| Passo | Status | Notas |
|-------|--------|-------|
| Plano aparece | ⏳ | `/admin/plano` |
| Checkout abre | ⏳ | Edge `create-mercado-pago-preference` |
| Webhook → `payment_logs` | ⚠️ | Migration `20260518000000_payment_logs.sql` + redeploy webhook |
| Status assinatura atualiza | ⏳ | `tenant_subscriptions` após pagamento aprovado |

### 8. Segurança

| Passo | Status | Notas |
|-------|--------|-------|
| Empresa A ≠ B | ✅ | Queries com `company_id`; RLS no Supabase |
| Comum não acessa master | ✅ | `guardMasterRoute` + RPC master |
| Feature OFF bloqueia | ✅ | `guardCompanyPlanFeatureAccess` + RPC |
| Feature ON libera | ⏳ | Testar Essencial vs Studio Pro após migration B |

### 9. Produção (artefato)

| Passo | Status |
|-------|--------|
| Build limpo | ✅ |
| Sem `sb_publishable` | ✅ |
| Sem role master no client | ✅ |
| Sem `authLoading` quebrado | ✅ |
| Error boundary rotas principais | ✅ `__root` + `/cadastro`; demais usam root |

---

## Bugs restantes

| Severidade | Item | Ação |
|------------|------|------|
| — | Nenhum bug bloqueante encontrado no código desta branch | — |
| Baixa | ESLint falha por CRLF em massa no repo | Não bloqueia build; opcional `prettier --write` em lote |
| Operacional | Produção pode estar em commit **anterior** a `pre-venda-safe` / `plan-features-safe` | Confirmar `git log` na VPS e redeploy |
| Operacional | Migrations Fase A/B não confirmadas no projeto Supabase prod | Aplicar SQL antes de vender com feature flags |

---

## Riscos restantes

1. **Deploy desalinhado** — Front antigo com fallback fake de planos ou com simulação de pagamento em produção. Mitigação: deploy `plan-features-safe` (ou merge → main) + smoke `PRE_VENDA_CHECKLIST.md`.
2. **Migrations não aplicadas** — Master planos quebra com `role "master"` ou RPC inexistente; feature toggles falham sem tabela `plan_features`. Mitigação: rodar migrations na ordem: master fix → `payment_logs` → `plan_features_catalog`.
3. **Webhook MP** — Pagamentos de assinatura MP podem enviar `subscription_preapproval` (ignorado pelo parser). Cobrança one-shot/checkout deve usar tópico `payment`. Testar 1 pagamento real e linha em `payment_logs`.
4. **Branding vs billing** — `past_due` em plano sem branding: `/admin/branding` redireciona para upgrade (comportamento esperado pós Fase B).
5. **Primeiro cliente novo** — Onboarding + trial + primeiro checkout: monitorar `tenant_subscriptions.status` e suporte manual se webhook atrasar.

---

## Deploy recomendado antes da primeira venda

Ordem sugerida:

1. Supabase SQL Editor — migrations (se ainda não):
   - `20260518000000_payment_logs.sql`
   - `20260518100000_plan_features_catalog.sql`
   - Se master planos falhar: `supabase/scripts/fix_master_plans_apply_now.sql`
2. Redeploy Edge Functions: `mercado-pago-webhook`, `create-mercado-pago-preference`
3. VPS: `git pull` branch de release → `npm ci` → `npm run build` → `pm2 restart`
4. `.env`: só `VITE_SUPABASE_ANON_KEY=eyJ...` (sem `sb_publishable_`)
5. Smoke manual (30 min): tabela em `docs/PRE_VENDA_CHECKLIST.md` + itens 3–8 deste doc

---

## O que monitorar nos primeiros clientes

| Monitor | Onde | Alerta se |
|---------|------|-----------|
| Assinatura após pagamento | `tenant_subscriptions.status` | Fica `trialing`/`past_due` após MP aprovado |
| Webhook | `payment_logs` | Sem linha após pagamento teste |
| Onboarding | Logs / suporte | `completeSignupOnboarding` falha ou empresa duplicada |
| Agendamento público | Slug + horários | Slots vazios com agenda aberta |
| Plano vs recurso | Master toggles + reclamação “não tenho WhatsApp” | `plan_features.enabled` incorreto |
| Erros master | Toast / SQL | `role "master" does not exist" → reaplicar fix SQL |
| Performance auth | Usuários | Timeout pós-login (>20s) — rede ou RPC lento |

---

## Script rápido pós-deploy (local com `.env` de produção)

```bash
npm run test:plan-features
npm run test:public-booking
npm run build
node scripts/verify-supabase-auth.mjs   # opcional: RPC + platform_admins
```

---

## Referências

- Fase A: `docs/PRE_VENDA_CHECKLIST.md`, `docs/PRE_VENDA_FASE_A_ROLLBACK.md`
- Fase B: `docs/PLAN_FEATURES_FASE_B.md`
- PR branch: `plan-features-safe`

---

**Responsável pela go-live:** após marcar ⏳ como ✅ no smoke manual com as duas contas de teste, alterar status para **Pronto para venda**.
