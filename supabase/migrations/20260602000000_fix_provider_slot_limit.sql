-- Corrige limite 0 de prestadores (COALESCE(0,3)=0) e garante 3 vagas no Elite com feature team.

BEGIN;

UPDATE public.plans
SET included_provider_slots = 3
WHERE lower(name) LIKE '%elite%'
  AND COALESCE(included_provider_slots, 0) < 1;

UPDATE public.tenant_provider_addons
SET extra_slots = 0
WHERE extra_slots IS NULL OR extra_slots < 0;

CREATE OR REPLACE FUNCTION public.company_provider_slot_limit(p_company_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_included int := 3;
  v_extra int := 0;
  v_has_team boolean;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN 0;
  END IF;

  v_has_team := public.company_has_plan_feature(p_company_id, 'team');

  v_plan_id := public.resolve_company_plan_id(p_company_id);
  IF v_plan_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(p.included_provider_slots, 0), 3)
    INTO v_included
    FROM public.plans p
    WHERE p.id = v_plan_id;
  END IF;

  IF NOT FOUND OR v_included IS NULL THEN
    v_included := 3;
  END IF;

  SELECT COALESCE(tpa.extra_slots, 0)
  INTO v_extra
  FROM public.tenant_provider_addons tpa
  WHERE tpa.company_id = p_company_id;

  IF NOT FOUND OR v_extra IS NULL THEN
    v_extra := 0;
  END IF;

  v_extra := GREATEST(v_extra, 0);

  -- Elite + Equipe: mínimo 3 vagas incluídas (add-ons somam depois)
  IF v_has_team AND v_included < 3 THEN
    v_included := 3;
  END IF;

  RETURN GREATEST(v_included + v_extra, 0);
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
