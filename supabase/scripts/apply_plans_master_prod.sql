-- =============================================================================
-- BeautyFlow — Planos + Master admin (produção)
-- Execute no Supabase Dashboard → SQL Editor, NA ORDEM:
--   1) Cole e rode: supabase/migrations/20260516800000_master_plans_authorization_fix.sql
--   2) Cole e rode: supabase/migrations/20260516900000_platform_admin_email_bootstrap.sql
--   3) Cole e rode: supabase/migrations/20260517010000_signup_onboarding_with_plan.sql
--   4) Cole e rode: supabase/migrations/20260517020000_fix_master_plans_function_owner.sql
--   5) Cole e rode: supabase/migrations/20260517030000_fix_platform_admin_no_master_role.sql
--      (ou o atalho: supabase/scripts/fix_master_plans_apply_now.sql)
-- =============================================================================
-- Este arquivo é referência; o conteúdo completo está nas migrations acima.

-- Bootstrap admin (se ainda não existir):
INSERT INTO public.platform_admins (user_id)
SELECT u.id
FROM auth.users u
WHERE lower(u.email) IN ('melquemendes96@gmail.com', 'melquemendes98@gmail.com')
ON CONFLICT (user_id) DO NOTHING;
