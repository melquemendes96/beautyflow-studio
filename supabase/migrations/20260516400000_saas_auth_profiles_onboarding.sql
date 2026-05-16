-- SaaS auth flow: profiles, onboarding empresa, status de assinatura estendidos, RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enum: novos status de assinatura
-- ---------------------------------------------------------------------------
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'trial_expired';

-- ---------------------------------------------------------------------------
-- profiles (espelho leve de auth.users para o app)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- companies: campos de onboarding
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT;

-- ---------------------------------------------------------------------------
-- tenant_subscriptions: trial explícito + provedor
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

-- ---------------------------------------------------------------------------
-- ensure_user_profile: cria/atualiza profile após login
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_avatar text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT
    email,
    nullif(trim(coalesce(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      split_part(email, '@', 1)
    )), ''),
    nullif(trim(coalesce(
      raw_user_meta_data->>'avatar_url',
      raw_user_meta_data->>'picture'
    )), '')
  INTO v_email, v_name, v_avatar
  FROM auth.users
  WHERE id = v_uid;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (v_uid, v_email, v_name, v_avatar)
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'profile_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- complete_company_onboarding: empresa + owner + billing_profile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_company_onboarding(
  p_company_name text,
  p_owner_name text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_segment text DEFAULT NULL,
  p_document text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_name text;
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_try int := 0;
  v_boot json;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  PERFORM public.ensure_user_profile();

  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    v_boot := public.user_bootstrap_company(p_company_name);
    IF (v_boot->>'ok')::boolean IS NOT TRUE THEN
      RETURN v_boot;
    END IF;
    v_company_id := (v_boot->>'company_id')::uuid;
  ELSE
    v_name := nullif(trim(p_company_name), '');
    IF v_name IS NOT NULL AND length(v_name) >= 2 THEN
      UPDATE public.companies
      SET name = v_name, updated_at = now()
      WHERE id = v_company_id;
      UPDATE public.branding_settings
      SET brand_name = v_name
      WHERE company_id = v_company_id;
    END IF;
  END IF;

  UPDATE public.companies
  SET
    owner_name = nullif(trim(p_owner_name), ''),
    segment = nullif(trim(p_segment), ''),
    phone = COALESCE(nullif(trim(p_whatsapp), ''), phone),
    updated_at = now()
  WHERE id = v_company_id;

  INSERT INTO public.billing_profiles (
    company_id, legal_name, document, phone, city, state
  )
  VALUES (
    v_company_id,
    nullif(trim(coalesce(p_owner_name, p_company_name)), ''),
    nullif(trim(p_document), ''),
    nullif(trim(p_whatsapp), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_state), '')
  )
  ON CONFLICT (company_id) DO UPDATE SET
    legal_name = COALESCE(EXCLUDED.legal_name, billing_profiles.legal_name),
    document = COALESCE(EXCLUDED.document, billing_profiles.document),
    phone = COALESCE(EXCLUDED.phone, billing_profiles.phone),
    city = COALESCE(EXCLUDED.city, billing_profiles.city),
    state = COALESCE(EXCLUDED.state, billing_profiles.state),
    updated_at = now();

  RETURN json_build_object('ok', true, 'company_id', v_company_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_company_onboarding(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_company_onboarding(text, text, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.complete_company_onboarding IS
  'Onboarding: cria empresa (se necessário), owner, billing_profile e dados do responsável.';

-- ---------------------------------------------------------------------------
-- get_auth_panel_context: inclui has_profile
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
  v_has_profile boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'is_platform_admin', false,
      'company_memberships', '[]'::jsonb,
      'has_profile', false
    );
  END IF;

  PERFORM public.ensure_user_profile();

  v_is_admin := public.is_platform_admin();

  IF v_is_admin THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (v_uid)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid)
  INTO v_has_profile;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('company_id', cu.company_id, 'role', cu.role)),
    '[]'::jsonb
  )
  INTO v_memberships
  FROM public.company_users cu
  WHERE cu.user_id = v_uid;

  RETURN jsonb_build_object(
    'is_platform_admin', v_is_admin,
    'company_memberships', v_memberships,
    'has_profile', v_has_profile
  );
END;
$$;

-- Master definitivo
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users
WHERE email = 'melquemendes96@gmail.com'
   OR id = '93fd71cc-a4f6-460a-95c8-d4a8e5f4cde8'::uuid
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
