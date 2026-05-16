-- Bootstrap: branding + business_settings padrão; limite de alteração de slug; metadata do usuário

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug_change_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.companies.slug_change_count IS
  'Quantas vezes o slug público foi alterado (máx. 1 por ciclo — validado no app).';

CREATE OR REPLACE FUNCTION public.user_bootstrap_company(
  p_company_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_meta_name text;
  v_name text;
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_try int := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('ok', true, 'company_id', v_company_id, 'existing', true);
  END IF;

  SELECT nullif(trim(coalesce(
    raw_user_meta_data->>'company_name',
    raw_user_meta_data->>'companyName'
  )), '')
  INTO v_meta_name
  FROM auth.users
  WHERE id = v_user_id;

  v_name := nullif(trim(coalesce(p_company_name, v_meta_name, '')), '');

  IF v_name IS NULL OR length(v_name) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'company_name_required');
  END IF;

  v_base_slug := nullif(trim(both '-' from public.slugify_basic(v_name)), '');

  IF v_base_slug IS NULL OR length(v_base_slug) < 2 THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_company_name');
  END IF;

  LOOP
    v_try := v_try + 1;
    v_suffix := lpad((floor(random() * 10000))::int::text, 4, '0');
    v_slug := CASE WHEN v_try = 1 THEN v_base_slug ELSE v_base_slug || '-' || v_suffix END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.companies WHERE slug = v_slug);
    EXIT WHEN v_try >= 10;
  END LOOP;

  INSERT INTO public.companies (name, slug, status, onboarding_completed, slug_change_count)
  VALUES (v_name, v_slug, 'active'::public.company_status, false, 0)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_users (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner'::public.company_user_role);

  INSERT INTO public.branding_settings (company_id, brand_name)
  VALUES (v_company_id, v_name)
  ON CONFLICT (company_id) DO UPDATE SET brand_name = EXCLUDED.brand_name;

  INSERT INTO public.business_settings (company_id)
  VALUES (v_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE auth.users
  SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('company_name', v_name)
  WHERE id = v_user_id;

  RETURN json_build_object('ok', true, 'company_id', v_company_id, 'slug', v_slug, 'existing', false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

COMMENT ON FUNCTION public.user_bootstrap_company(text) IS
  'Cria empresa + owner + branding/business_settings. Nome obrigatório (param ou metadata). Sem fallback Meu Studio.';

COMMIT;
