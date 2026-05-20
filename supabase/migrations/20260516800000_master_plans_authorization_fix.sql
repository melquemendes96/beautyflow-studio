-- Master plans: RLS corrigido (master vê todos; anônimo só ativos) + RPCs SECURITY DEFINER para CRUD.
-- Corrige regressão em 202605166 (SELECT sem is_platform_admin) e grants de escrita.

BEGIN;

-- ---------------------------------------------------------------------------
-- is_platform_admin: SECURITY DEFINER + bypass RLS (anti-recursão)
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
-- ensure_platform_admin
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
-- plans: políticas SELECT separadas (anon vs master autenticado)
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_public ON public.plans;
DROP POLICY IF EXISTS plans_select_anon ON public.plans;
DROP POLICY IF EXISTS plans_select_authenticated ON public.plans;
DROP POLICY IF EXISTS "Public can read active plans" ON public.plans;

CREATE POLICY plans_select_anon
  ON public.plans
  FOR SELECT
  TO anon
  USING (active = true);

CREATE POLICY plans_select_authenticated
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (active = true OR public.is_platform_admin());

DROP POLICY IF EXISTS plans_insert ON public.plans;
DROP POLICY IF EXISTS plans_update ON public.plans;
DROP POLICY IF EXISTS plans_delete ON public.plans;

CREATE POLICY plans_insert
  ON public.plans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY plans_update
  ON public.plans
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY plans_delete
  ON public.plans
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;

-- ---------------------------------------------------------------------------
-- master_list_plans (reaplica com bypass RLS)
-- ---------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.master_list_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_list_plans() TO authenticated;

-- ---------------------------------------------------------------------------
-- Master CRUD via RPC (não depende de policy na escrita direta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_create_plan(
  p_name text,
  p_price numeric,
  p_features jsonb DEFAULT '[]'::jsonb,
  p_active boolean DEFAULT true
)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row public.plans;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas platform_admin pode criar planos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Nome do plano é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Preço inválido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.plans (name, price, features, active)
  VALUES (
    trim(p_name),
    p_price,
    COALESCE(p_features, '[]'::jsonb),
    COALESCE(p_active, true)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_update_plan(
  p_plan_id uuid,
  p_name text DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_features jsonb DEFAULT NULL,
  p_active boolean DEFAULT NULL
)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row public.plans;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas platform_admin pode editar planos.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.plans
  SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    price = COALESCE(p_price, price),
    features = COALESCE(p_features, features),
    active = COALESCE(p_active, active)
  WHERE id = p_plan_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_delete_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas platform_admin pode excluir planos.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.plans WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.master_create_plan(text, numeric, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_update_plan(uuid, text, numeric, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.master_delete_plan(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.master_create_plan(text, numeric, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_update_plan(uuid, text, numeric, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_delete_plan(uuid) TO authenticated;

-- Catálogo público (landing): leitura segura sem expor planos inativos
CREATE OR REPLACE FUNCTION public.list_public_plans()
RETURNS SETOF public.plans
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT p.*
  FROM public.plans p
  WHERE p.active = true
  ORDER BY p.price ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_public_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_plans() TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_plans() TO authenticated;

COMMIT;
