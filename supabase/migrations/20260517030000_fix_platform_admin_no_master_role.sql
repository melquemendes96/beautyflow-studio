-- Fix definitivo: "role master does not exist"
-- Causa: função is_platform_admin (ou outras) com OWNER = role PostgreSQL "master".
-- Solução: OWNER postgres + checagem direta em platform_admins (sem depender de is_platform_admin em RLS).

BEGIN;

-- Helper estável: só platform_admins (sem metadata auth.users)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_platform_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;

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
    RAISE EXCEPTION 'Acesso negado: apenas platform_admin.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.plans p
  ORDER BY p.price ASC NULLS LAST;
END;
$$;

ALTER FUNCTION public.master_list_plans() OWNER TO postgres;

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
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.plans (name, price, features, active)
  VALUES (trim(p_name), p_price, COALESCE(p_features, '[]'::jsonb), COALESCE(p_active, true))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER FUNCTION public.master_create_plan(text, numeric, jsonb, boolean) OWNER TO postgres;

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
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
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

ALTER FUNCTION public.master_update_plan(uuid, text, numeric, jsonb, boolean) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.master_delete_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.plans WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION public.master_delete_plan(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.master_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_create_plan(text, numeric, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_update_plan(uuid, text, numeric, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_delete_plan(uuid) TO authenticated;

-- RLS plans: checagem direta em platform_admins (evita is_platform_admin quebrado)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_public ON public.plans;
DROP POLICY IF EXISTS plans_select_anon ON public.plans;
DROP POLICY IF EXISTS plans_select_authenticated ON public.plans;
DROP POLICY IF EXISTS "Public can read active plans" ON public.plans;

CREATE POLICY plans_select_anon
  ON public.plans FOR SELECT TO anon
  USING (active = true);

CREATE POLICY plans_select_authenticated
  ON public.plans FOR SELECT TO authenticated
  USING (
    active = true
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

DROP POLICY IF EXISTS plans_insert ON public.plans;
DROP POLICY IF EXISTS plans_update ON public.plans;
DROP POLICY IF EXISTS plans_delete ON public.plans;

CREATE POLICY plans_insert
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()));

CREATE POLICY plans_update
  ON public.plans FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()));

CREATE POLICY plans_delete
  ON public.plans FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()));

GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;

-- Garantir master principal
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users
WHERE lower(email) IN ('melquemendes96@gmail.com', 'melquemendes98@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
