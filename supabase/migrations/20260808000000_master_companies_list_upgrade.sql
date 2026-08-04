-- Master empresas: listagem enriquecida (plano + assinatura) para o painel operacional.

BEGIN;

DROP FUNCTION IF EXISTS public.master_list_companies();

CREATE OR REPLACE FUNCTION public.master_list_companies()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  email text,
  phone text,
  plan_id uuid,
  status public.company_status,
  created_at timestamptz,
  updated_at timestamptz,
  onboarding_completed boolean,
  plan_name text,
  plan_price numeric,
  subscription_status text,
  subscription_period_end timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
SET row_security = off
AS $$
  SELECT
    c.id,
    c.name,
    c.slug,
    c.email,
    c.phone,
    c.plan_id,
    c.status,
    c.created_at,
    c.updated_at,
    COALESCE(c.onboarding_completed, false) AS onboarding_completed,
    p.name AS plan_name,
    p.price AS plan_price,
    ts.status::text AS subscription_status,
    ts.current_period_end AS subscription_period_end
  FROM public.companies c
  LEFT JOIN public.plans p ON p.id = c.plan_id
  LEFT JOIN LATERAL (
    SELECT s.status, s.current_period_end
    FROM public.tenant_subscriptions s
    WHERE s.company_id = c.id
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 1
  ) ts ON true
  WHERE public.is_platform_admin()
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.master_list_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_list_companies() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
