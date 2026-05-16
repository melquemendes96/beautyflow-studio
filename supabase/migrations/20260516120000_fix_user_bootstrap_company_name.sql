-- Corrige bootstrap self-serve: usa nome real (param ou user_metadata), sem fallback "Meu Studio".

BEGIN;

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

  INSERT INTO public.companies (name, slug, status, onboarding_completed)
  VALUES (v_name, v_slug, 'active'::public.company_status, false)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_users (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner'::public.company_user_role);

  RETURN json_build_object('ok', true, 'company_id', v_company_id, 'slug', v_slug, 'existing', false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

COMMENT ON FUNCTION public.user_bootstrap_company(text) IS
  'Cria empresa + owner. Nome: parâmetro p_company_name ou user_metadata.company_name. Sem fallback genérico.';

COMMIT;
