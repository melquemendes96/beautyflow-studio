-- Master panel: RLS sem recursão + RPCs SECURITY DEFINER para leitura/escrita master.

BEGIN;

-- ---------------------------------------------------------------------------
-- is_platform_admin: bypass RLS na checagem (evita recursão em policies)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND (
        COALESCE(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role', '')
          IN ('master', 'platform_admin')
        OR COALESCE(
          u.raw_app_meta_data->>'is_super_admin',
          u.raw_user_meta_data->>'is_super_admin',
          'false'
        ) IN ('true', 't', '1', 'yes')
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;

-- ---------------------------------------------------------------------------
-- Garante vínculo em platform_admins (chamado pelo app após login master)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_platform_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF NOT public.is_platform_admin() THEN
    RETURN jsonb_build_object('ok', false, 'is_platform_admin', false);
  END IF;

  INSERT INTO public.platform_admins (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'is_platform_admin', true, 'user_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_platform_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- platform_admins: SELECT sem chamar is_platform_admin() (anti-recursão)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_admins_select ON public.platform_admins;
CREATE POLICY platform_admins_select
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS platform_admins_select_own ON public.platform_admins;
CREATE POLICY platform_admins_select_own
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Master RPCs: listagens (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_list_companies()
RETURNS SETOF public.companies
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT c.*
  FROM public.companies c
  WHERE public.is_platform_admin()
  ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.master_list_plans()
RETURNS SETOF public.plans
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT p.*
  FROM public.plans p
  WHERE public.is_platform_admin()
  ORDER BY p.price ASC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.master_list_subscriptions()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  plan_id uuid,
  status public.subscription_status,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  trial_used boolean,
  created_at timestamptz,
  updated_at timestamptz,
  company_name text,
  company_slug text,
  plan_name text,
  plan_price numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT
    ts.id,
    ts.company_id,
    ts.plan_id,
    ts.status,
    ts.current_period_start,
    ts.current_period_end,
    ts.trial_start,
    ts.trial_end,
    ts.trial_used,
    ts.created_at,
    ts.updated_at,
    c.name AS company_name,
    c.slug AS company_slug,
    p.name AS plan_name,
    p.price AS plan_price
  FROM public.tenant_subscriptions ts
  JOIN public.companies c ON c.id = ts.company_id
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE public.is_platform_admin()
  ORDER BY ts.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.master_list_companies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_list_plans() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_list_subscriptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_list_companies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_list_subscriptions() TO authenticated;

-- get_auth_panel_context: sincroniza platform_admins
CREATE OR REPLACE FUNCTION public.get_auth_panel_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_memberships jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'is_platform_admin', false,
      'company_memberships', '[]'::jsonb
    );
  END IF;

  v_is_admin := public.is_platform_admin();

  IF v_is_admin THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (v_uid)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('company_id', cu.company_id, 'role', cu.role)),
    '[]'::jsonb
  )
  INTO v_memberships
  FROM public.company_users cu
  WHERE cu.user_id = v_uid;

  RETURN jsonb_build_object(
    'is_platform_admin', v_is_admin,
    'company_memberships', v_memberships
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_panel_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_panel_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_panel_context() TO anon;

-- Master principal
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users
WHERE email = 'melquemendes96@gmail.com'
   OR id = '93fd71cc-a4f6-460a-95c8-d4a8e5f4cde8'::uuid
ON CONFLICT (user_id) DO NOTHING;

UPDATE auth.users
SET
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'master', 'is_super_admin', true),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'master', 'is_super_admin', true)
WHERE email = 'melquemendes96@gmail.com'
   OR id = '93fd71cc-a4f6-460a-95c8-d4a8e5f4cde8'::uuid;

COMMIT;
