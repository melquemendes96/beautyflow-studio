-- Onboarding pós-cadastro: empresa + vínculo admin (owner) + branding + assinatura trial opcional.
-- Não altera user_bootstrap_company existente; orquestra criação segura para auth.uid().

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_signup_onboarding(
  p_company_name text,
  p_plan_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_slug text;
  v_email text;
  v_boot json;
  v_existing boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT cu.company_id INTO v_company_id
  FROM public.company_users cu
  WHERE cu.user_id = v_user_id
  ORDER BY cu.created_at
  LIMIT 1;

  IF FOUND THEN
    v_existing := true;
  ELSE
    v_boot := public.user_bootstrap_company(p_company_name);
    IF coalesce((v_boot->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN v_boot;
    END IF;
    v_company_id := (v_boot->>'company_id')::uuid;
    v_slug := v_boot->>'slug';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NOT NULL THEN
    UPDATE public.companies
    SET email = COALESCE(email, v_email), updated_at = now()
    WHERE id = v_company_id;
  END IF;

  IF p_plan_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.plans pl WHERE pl.id = p_plan_id AND pl.active = true
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_subscriptions ts WHERE ts.company_id = v_company_id
    ) THEN
      INSERT INTO public.tenant_subscriptions (
        company_id,
        plan_id,
        status,
        trial_start,
        trial_end,
        current_period_start,
        current_period_end,
        trial_used,
        last_plan_change_at
      )
      VALUES (
        v_company_id,
        p_plan_id,
        'trialing'::public.subscription_status,
        now(),
        now() + interval '7 days',
        now(),
        now() + interval '7 days',
        true,
        now()
      );
    END IF;

    UPDATE public.companies
    SET plan_id = p_plan_id, updated_at = now()
    WHERE id = v_company_id;
  END IF;

  IF v_slug IS NULL THEN
    SELECT slug INTO v_slug FROM public.companies WHERE id = v_company_id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'company_id', v_company_id,
    'slug', v_slug,
    'existing', v_existing
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup_onboarding(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_signup_onboarding(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_signup_onboarding(text, uuid) IS
  'Cadastro SaaS: cria empresa (se necessário), owner, branding, trial 7d no plano ativo informado.';

COMMIT;
