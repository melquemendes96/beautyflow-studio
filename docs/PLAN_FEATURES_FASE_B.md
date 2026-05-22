# Fase B — Planos por feature flags

Branch: `plan-features-safe` (base: `pre-venda-safe` / Fase A validada)

## O que mudou

- Tabelas `features_catalog` e `plan_features` (migration `20260518100000_plan_features_catalog.sql`)
- RPC `company_has_plan_feature(company_id, feature_key)` com fallback por nome se o plano não tiver flags
- Front: `hasFeatureAccess()` em `src/lib/plan-access.ts`
- Gates admin: branding, lista de espera, relatórios, WhatsApp (`src/lib/route-guards.ts`)
- Master > Planos: toggles ON/OFF, adicionar/remover do catálogo (sem textarea de texto livre)

## Aplicar no Supabase (antes do deploy front)

1. SQL Editor → colar e executar `supabase/migrations/20260518100000_plan_features_catalog.sql`
2. Conferir seed:

```sql
SELECT key, name FROM public.features_catalog ORDER BY category, name;
SELECT p.name, pf.feature_key, pf.enabled
FROM public.plan_features pf
JOIN public.plans p ON p.id = pf.plan_id
ORDER BY p.name, pf.feature_key;
```

3. Essencial = core ON; Studio Pro = + branding/waitlist/reports; Elite = + whatsapp/automation/finance

## Testes locais

```bash
node scripts/plan-features-access.test.mjs
npm run build
```

### Checklist manual (pós-migration)

| Fluxo | Esperado |
|--------|----------|
| Login / cadastro / OAuth | Sem alteração |
| Agendamento público (`/agendar/...`) | Sem gate de plano no cliente |
| Master > Planos | Toggles, + adicionar, X remover |
| Empresa Essencial | Sem WhatsApp/relatórios/branding (redirect upgrade) |
| Empresa Studio Pro / MA Barbearia | Branding, waitlist, reports OK |
| Empresa Elite | WhatsApp OK |
| `past_due` | Billing exempt em config/servicos/plano; branding exige feature |

## Rollback

### Código

```bash
git checkout pre-venda-safe
# ou reverter o merge/commit da Fase B
npm ci && npm run build
# redeploy dist + pm2 restart
```

O front antigo continua usando `planNameAllowsFeature` se o RPC falhar (fallback no `hasFeatureAccess`).

### Banco (opcional — só se precisar desfazer flags)

```sql
-- Remove flags e catálogo; NÃO apaga plans nem assinaturas
DROP TABLE IF EXISTS public.plan_features CASCADE;
DROP TABLE IF EXISTS public.features_catalog CASCADE;

DROP FUNCTION IF EXISTS public.company_has_plan_feature(uuid, text);
DROP FUNCTION IF EXISTS public.legacy_plan_allows_feature(text, text);
DROP FUNCTION IF EXISTS public.resolve_company_plan_id(uuid);
DROP FUNCTION IF EXISTS public.sync_plan_marketing_features(uuid);
DROP FUNCTION IF EXISTS public.master_list_features_catalog();
DROP FUNCTION IF EXISTS public.master_list_plan_features(uuid);
DROP FUNCTION IF EXISTS public.master_set_plan_feature(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.master_remove_plan_feature(uuid, text);
```

Restaurar `master_create_plan` anterior se necessário (script em `supabase/scripts/fix_master_plans_apply_now.sql`).

### Sem rollback de banco

Se a migration já rodou mas o front voltou para branch antiga: o fallback por nome do plano no RPC antigo não existe — empresas com `plan_features` populados seguem o banco; branch antiga usa só nome do plano no client. Recomendado: manter migration e reverter só front se emergência.

## MA Barbearia

Slug `ma-barbearia` e agendamento público não dependem de `plan_features`. Acesso admin segue assinatura + flags do plano vinculado (Studio Pro → branding/reports ON após migration).
