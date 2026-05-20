-- Planos públicos (landing /plans) + RLS platform_admins apenas para o próprio usuário autenticado.

-- ---------------------------------------------------------------------------
-- plans: SELECT anônimo só para planos ativos (coluna active, não is_active)
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_public ON public.plans;
DROP POLICY IF EXISTS "Public can read active plans" ON public.plans;

CREATE POLICY plans_select_public
  ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- Master continua gerenciando catálogo
DROP POLICY IF EXISTS plans_insert ON public.plans;
DROP POLICY IF EXISTS plans_update ON public.plans;
DROP POLICY IF EXISTS plans_delete ON public.plans;

CREATE POLICY plans_insert
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY plans_update
  ON public.plans FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY plans_delete
  ON public.plans FOR DELETE TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.plans TO anon;
GRANT SELECT ON public.plans TO authenticated;

-- ---------------------------------------------------------------------------
-- platform_admins: sem leitura anônima; só o próprio registro autenticado
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_select_own ON public.platform_admins;
DROP POLICY IF EXISTS "User can check own platform admin status" ON public.platform_admins;

CREATE POLICY platform_admins_select_own
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
