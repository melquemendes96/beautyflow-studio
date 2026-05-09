-- Fase 12.x — Onboarding self-serve (criar empresa + vínculo automaticamente no 1º login)
-- Objetivo: qualquer usuário autenticado pode virar "owner" de uma empresa recém-criada,
-- sem depender do Master para inserir em `companies`/`company_users`.

BEGIN;

CREATE OR REPLACE FUNCTION public.slugify_basic(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(p_text, '')),'[^a-z0-9]+','-','g')
$$;

-- Cria empresa + vínculo (owner) para o auth.uid().
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

  -- idempotente: se já tem vínculo, não cria outra empresa
  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('ok', true, 'company_id', v_company_id, 'existing', true);
  END IF;

  v_name := nullif(trim(coalesce(p_company_name, '')), '');
  IF v_name IS NULL THEN
    v_name := 'Meu Studio';
  END IF;

  v_base_slug := nullif(public.slugify_basic(v_name), '');
  IF v_base_slug IS NULL THEN
    v_base_slug := 'meu-studio';
  END IF;

  -- gera slug único
  LOOP
    v_try := v_try + 1;
    v_suffix := lpad((floor(random() * 10000))::int::text, 4, '0');
    v_slug := CASE WHEN v_try = 1 THEN v_base_slug ELSE v_base_slug || '-' || v_suffix END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.companies WHERE slug = v_slug);
    EXIT WHEN v_try >= 10;
  END LOOP;

  INSERT INTO public.companies (name, slug, status)
  VALUES (v_name, v_slug, 'active'::public.company_status)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_users (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner'::public.company_user_role);

  RETURN json_build_object('ok', true, 'company_id', v_company_id, 'slug', v_slug, 'existing', false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

REVOKE ALL ON FUNCTION public.user_bootstrap_company(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_bootstrap_company(text) TO authenticated;

COMMENT ON FUNCTION public.user_bootstrap_company(text) IS
  'Fase 12.x: cria empresa + vínculo owner para o usuário autenticado (self-serve).';

COMMIT;

