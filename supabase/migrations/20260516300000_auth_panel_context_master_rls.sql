-- Painel auth: uma RPC SECURITY DEFINER evita falhas de RLS recursivo em platform_admins/company_users.
-- Garante grants em is_platform_admin e leitura do próprio vínculo.

CREATE OR REPLACE FUNCTION public.get_auth_panel_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE pa.user_id = v_uid
  )
  INTO v_is_admin;

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

COMMENT ON FUNCTION public.get_auth_panel_context() IS
  'Retorna is_platform_admin e vínculos company_users do usuário autenticado (auth.uid).';

REVOKE ALL ON FUNCTION public.get_auth_panel_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_panel_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_panel_context() TO anon;

-- Reforço: helpers usados nas policies
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;

-- Leitura explícita do próprio registro em platform_admins (além da policy existente)
DROP POLICY IF EXISTS platform_admins_select_own ON public.platform_admins;
CREATE POLICY platform_admins_select_own
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Leitura explícita dos próprios vínculos em company_users
DROP POLICY IF EXISTS company_users_select_own ON public.company_users;
CREATE POLICY company_users_select_own
  ON public.company_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
