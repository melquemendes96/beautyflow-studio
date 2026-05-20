-- Cole no Supabase SQL Editor e execute (fix "role master does not exist" + listar planos).
-- Depois recarregue /master/planos com Ctrl+Shift+R.

-- 1) Corrigir OWNER de funções críticas
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_platform_admin',
        'ensure_platform_admin',
        'get_auth_panel_context',
        'master_list_plans',
        'master_create_plan',
        'master_update_plan',
        'master_delete_plan',
        'list_public_plans'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', r.sig);
  END LOOP;
END $$;

-- 2) is_platform_admin: só platform_admins
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_platform_admin() OWNER TO postgres;

-- 3) master_list_plans (sem chamar is_platform_admin)
CREATE OR REPLACE FUNCTION public.master_list_plans()
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.* FROM public.plans p ORDER BY p.price ASC NULLS LAST;
END;
$$;

ALTER FUNCTION public.master_list_plans() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.master_list_plans() TO authenticated;

-- 4) Bootstrap admin
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'melquemendes96@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 5) Verificar
SELECT proname, pg_get_userbyid(proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('is_platform_admin', 'master_list_plans');
