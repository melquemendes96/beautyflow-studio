-- Snapshot de leitura das tabelas críticas (Fase A pré-venda).
-- Execute no Supabase SQL Editor e exporte o resultado (CSV) antes de deploys arriscados.

SELECT 'plans' AS tabela, count(*)::bigint AS linhas FROM public.plans
UNION ALL SELECT 'tenant_subscriptions', count(*) FROM public.tenant_subscriptions
UNION ALL SELECT 'company_users', count(*) FROM public.company_users
UNION ALL SELECT 'companies', count(*) FROM public.companies
UNION ALL SELECT 'platform_admins', count(*) FROM public.platform_admins
UNION ALL SELECT 'profiles', count(*) FROM public.profiles;

-- Detalhe opcional (descomente se precisar backup lógico rápido):
-- SELECT * FROM public.plans ORDER BY created_at;
-- SELECT id, company_id, status, plan_id, current_period_end FROM public.tenant_subscriptions ORDER BY updated_at DESC LIMIT 200;
