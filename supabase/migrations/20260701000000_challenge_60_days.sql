-- Desafio 60 dias: leads + trial configurável no onboarding de cadastro.
-- Fluxo normal (sem desafio) continua com trial 7 dias via default p_trial_days.

BEGIN;

-- ---------------------------------------------------------------------------
-- Leads do desafio (prospecção)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  whatsapp text NOT NULL,
  email text NOT NULL,
  instagram text NOT NULL,
  business_name text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead', 'account_created', 'activated', 'converted', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS challenge_leads_email_lower_uidx
  ON public.challenge_leads (lower(trim(email)));

CREATE INDEX IF NOT EXISTS challenge_leads_created_idx
  ON public.challenge_leads (created_at DESC);

ALTER TABLE public.challenge_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_leads_select_master ON public.challenge_leads;
CREATE POLICY challenge_leads_select_master
  ON public.challenge_leads FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.submit_challenge_lead(
  p_full_name text,
  p_whatsapp text,
  p_email text,
  p_instagram text,
  p_business_name text,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_name text := left(trim(COALESCE(p_full_name, '')), 120);
  v_wa text := left(regexp_replace(trim(COALESCE(p_whatsapp, '')), '[^0-9+]', '', 'g'), 20);
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_ig text := left(trim(both '@' from trim(COALESCE(p_instagram, ''))), 60);
  v_biz text := left(trim(COALESCE(p_business_name, '')), 120);
  v_id uuid;
BEGIN
  IF char_length(v_name) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'nome_invalido');
  END IF;
  IF char_length(v_wa) < 10 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_invalido');
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN json_build_object('ok', false, 'error', 'email_invalido');
  END IF;
  IF char_length(v_ig) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'instagram_invalido');
  END IF;
  IF char_length(v_biz) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'negocio_invalido');
  END IF;

  SELECT id INTO v_id
  FROM public.challenge_leads
  WHERE lower(trim(email)) = v_email
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.challenge_leads
    SET
      full_name = v_name,
      whatsapp = v_wa,
      instagram = v_ig,
      business_name = v_biz,
      utm_source = COALESCE(NULLIF(left(trim(COALESCE(p_utm_source, '')), 120), ''), utm_source),
      utm_medium = COALESCE(NULLIF(left(trim(COALESCE(p_utm_medium, '')), 120), ''), utm_medium),
      utm_campaign = COALESCE(NULLIF(left(trim(COALESCE(p_utm_campaign, '')), 120), ''), utm_campaign),
      utm_content = COALESCE(NULLIF(left(trim(COALESCE(p_utm_content, '')), 120), ''), utm_content),
      utm_term = COALESCE(NULLIF(left(trim(COALESCE(p_utm_term, '')), 120), ''), utm_term),
      updated_at = now()
    WHERE id = v_id;
    RETURN json_build_object('ok', true, 'lead_id', v_id, 'existing', true);
  END IF;

  INSERT INTO public.challenge_leads (
    full_name, whatsapp, email, instagram, business_name,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  )
  VALUES (
    v_name, v_wa, v_email, v_ig, v_biz,
    NULLIF(left(trim(COALESCE(p_utm_source, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_medium, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_campaign, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_content, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_term, '')), 120), '')
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'lead_id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.challenge_leads WHERE lower(trim(email)) = v_email LIMIT 1;
    RETURN json_build_object('ok', true, 'lead_id', v_id, 'existing', true);
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_challenge_lead(
  text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_challenge_lead(
  text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_challenge_lead(
  p_lead_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF p_lead_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'lead_invalido');
  END IF;

  UPDATE public.challenge_leads
  SET
    user_id = v_uid,
    company_id = COALESCE(p_company_id, company_id),
    status = CASE
      WHEN p_company_id IS NOT NULL THEN 'activated'
      ELSE 'account_created'
    END,
    updated_at = now()
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'lead_nao_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_challenge_lead(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_challenge_lead(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding com trial_days (default 7 = fluxo normal)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.complete_signup_onboarding(text, uuid);

CREATE OR REPLACE FUNCTION public.complete_signup_onboarding(
  p_company_name text,
  p_plan_id uuid DEFAULT NULL,
  p_trial_days integer DEFAULT 7
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
  v_days integer := GREATEST(1, LEAST(COALESCE(p_trial_days, 7), 90));
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
        now() + make_interval(days => v_days),
        now(),
        now() + make_interval(days => v_days),
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
    'existing', v_existing,
    'trial_days', v_days
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup_onboarding(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_signup_onboarding(text, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.complete_signup_onboarding(text, uuid, integer) IS
  'Cadastro SaaS: empresa + trial. p_trial_days default 7; desafio usa 60.';

-- ---------------------------------------------------------------------------
-- Marketing events do desafio
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketing_funnel_events
  DROP CONSTRAINT IF EXISTS marketing_funnel_events_event_name_check;

ALTER TABLE public.marketing_funnel_events
  ADD CONSTRAINT marketing_funnel_events_event_name_check CHECK (
    event_name IN (
      'demo_view',
      'whatsapp_click',
      'signup_start',
      'signup_complete',
      'purchase',
      'company_created',
      'payment_confirmed',
      'challenge_banner_view',
      'challenge_banner_dismiss',
      'challenge_lead_submit',
      'challenge_signup',
      'challenge_activated'
    )
  );

CREATE OR REPLACE FUNCTION public.track_marketing_event(
  p_event_name text,
  p_path text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_amount numeric DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_name text := lower(trim(COALESCE(p_event_name, '')));
  v_uid uuid := auth.uid();
BEGIN
  IF v_name NOT IN (
    'demo_view',
    'whatsapp_click',
    'signup_start',
    'signup_complete',
    'purchase',
    'challenge_banner_view',
    'challenge_banner_dismiss',
    'challenge_lead_submit',
    'challenge_signup',
    'challenge_activated'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'evento_invalido');
  END IF;

  INSERT INTO public.marketing_funnel_events (
    event_name, path, company_id, user_id, amount,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, metadata
  )
  VALUES (
    v_name,
    NULLIF(left(trim(COALESCE(p_path, '')), 300), ''),
    p_company_id,
    v_uid,
    p_amount,
    NULLIF(left(trim(COALESCE(p_utm_source, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_medium, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_campaign, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_content, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_term, '')), 120), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN json_build_object('ok', true);
END;
$$;

COMMIT;
