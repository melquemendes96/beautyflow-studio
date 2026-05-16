-- Login master definitivo — JM BeautyFlow
-- Aplica: is_platform_admin, get_auth_panel_context, RLS, bootstrap do master.

-- ---------------------------------------------------------------------------
-- is_platform_admin: platform_admins + metadata auth.users (role / is_super_admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.platform_admins pa
        WHERE pa.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM auth.users u
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
      )
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;

-- ---------------------------------------------------------------------------
-- get_auth_panel_context: uma RPC; auto-insere em platform_admins se metadata master
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_panel_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
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
    jsonb_agg(
      jsonb_build_object(
        'company_id', cu.company_id,
        'role', cu.role
      )
    ),
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

-- ---------------------------------------------------------------------------
-- Master principal (melquemendes96@gmail.com)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_admins (user_id)
SELECT id
FROM auth.users
WHERE email = 'melquemendes96@gmail.com'
   OR id = '93fd71cc-a4f6-460a-95c8-d4a8e5f4cde8'::uuid
ON CONFLICT (user_id) DO NOTHING;

-- Metadata master no Auth (fallback para is_platform_admin)
UPDATE auth.users
SET
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'master', 'is_super_admin', true),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'master', 'is_super_admin', true)
WHERE email = 'melquemendes96@gmail.com'
   OR id = '93fd71cc-a4f6-460a-95c8-d4a8e5f4cde8'::uuid;

-- ---------------------------------------------------------------------------
-- RLS: usuário autenticado lê o próprio vínculo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_admins_select_own ON public.platform_admins;
CREATE POLICY platform_admins_select_own
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS company_users_select_own ON public.company_users;
CREATE POLICY company_users_select_own
  ON public.company_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
