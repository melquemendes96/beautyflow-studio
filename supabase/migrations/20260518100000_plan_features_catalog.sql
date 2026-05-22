-- Fase B: planos por feature flags (catálogo + plan_features + RPCs).
-- Mantém plans.features (JSON marketing) e fallback por nome do plano.

BEGIN;

-- ---------------------------------------------------------------------------
-- Catálogo global de recursos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.features_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features_catalog(key) ON UPDATE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS plan_features_plan_id_idx ON public.plan_features(plan_id);
CREATE INDEX IF NOT EXISTS plan_features_feature_key_idx ON public.plan_features(feature_key);

COMMENT ON TABLE public.features_catalog IS 'Catálogo global de recursos (feature flags) do SaaS.';
COMMENT ON TABLE public.plan_features IS 'Recursos habilitados por plano (substitui inferência por nome).';

-- Seed catálogo (idempotente)
INSERT INTO public.features_catalog (key, name, description, category)
VALUES
  ('agenda', 'Agenda', 'Agenda e agendamentos no painel', 'core'),
  ('clients', 'Clientes', 'Cadastro e gestão de clientes', 'core'),
  ('services', 'Serviços', 'Catálogo de serviços', 'core'),
  ('public_booking', 'Página pública', 'Link público de agendamento', 'core'),
  ('history', 'Histórico', 'Histórico de atendimentos', 'core'),
  ('branding', 'Aparência da marca', 'Logo, cores e personalização', 'growth'),
  ('waitlist', 'Lista de espera', 'Fila de espera de horários', 'growth'),
  ('reports', 'Relatórios', 'Relatórios e métricas', 'growth'),
  ('whatsapp', 'WhatsApp', 'Integração WhatsApp oficial', 'premium'),
  ('automation', 'Automação', 'Lembretes e automações', 'premium'),
  ('finance', 'Financeiro', 'Cobrança e financeiro avançado', 'premium')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- ---------------------------------------------------------------------------
-- Migrar planos existentes (Essencial / Studio Pro / Elite + aliases)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_tier text;
  fk text;
  base_keys text[] := ARRAY['agenda','clients','services','public_booking','history'];
  pro_keys text[] := ARRAY['branding','waitlist','reports'];
  elite_keys text[] := ARRAY['whatsapp','automation','finance'];
BEGIN
  FOR r IN SELECT id, lower(trim(name)) AS n FROM public.plans LOOP
    v_tier := 'base';
    IF r.n LIKE '%elite%' THEN
      v_tier := 'elite';
    ELSIF r.n LIKE '%studio pro%' OR r.n LIKE '%stúdio pro%' OR r.n LIKE '%profissional%'
      OR (r.n LIKE '%pro%' AND r.n NOT LIKE '%elite%') THEN
      v_tier := 'pro';
    ELSIF r.n LIKE '%essencial%' OR r.n LIKE '%starter%' OR r.n LIKE '%premium%' THEN
      -- "Premium" legado no fallback = tier pro+; aqui tratamos premium como pro salvo elite explícito
      IF r.n LIKE '%premium%' AND r.n NOT LIKE '%elite%' THEN
        v_tier := 'pro';
      ELSE
        v_tier := 'base';
      END IF;
    END IF;

    DELETE FROM public.plan_features WHERE plan_id = r.id;

    FOREACH fk IN ARRAY base_keys LOOP
      INSERT INTO public.plan_features (plan_id, feature_key, enabled)
      VALUES (r.id, fk, true)
      ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true;
    END LOOP;

    IF v_tier IN ('pro', 'elite') THEN
      FOREACH fk IN ARRAY pro_keys LOOP
        INSERT INTO public.plan_features (plan_id, feature_key, enabled)
        VALUES (r.id, fk, true)
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true;
      END LOOP;
    ELSE
      FOREACH fk IN ARRAY pro_keys LOOP
        INSERT INTO public.plan_features (plan_id, feature_key, enabled)
        VALUES (r.id, fk, false)
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = false;
      END LOOP;
    END IF;

    IF v_tier = 'elite' THEN
      FOREACH fk IN ARRAY elite_keys LOOP
        INSERT INTO public.plan_features (plan_id, feature_key, enabled)
        VALUES (r.id, fk, true)
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true;
      END LOOP;
    ELSE
      FOREACH fk IN ARRAY elite_keys LOOP
        INSERT INTO public.plan_features (plan_id, feature_key, enabled)
        VALUES (r.id, fk, false)
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = false;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Sincroniza plans.features (bullets marketing) a partir do catálogo ON
CREATE OR REPLACE FUNCTION public.sync_plan_marketing_features(p_plan_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.plans p
  SET features = COALESCE(
    (
      SELECT jsonb_agg(fc.name ORDER BY fc.category, fc.name)
      FROM public.plan_features pf
      JOIN public.features_catalog fc ON fc.key = pf.feature_key
      WHERE pf.plan_id = p_plan_id AND pf.enabled = true
    ),
    '[]'::jsonb
  )
  WHERE p.id = p_plan_id;
$$;

-- Fallback legado (nome do plano) — espelha src/lib/plan-access.ts
CREATE OR REPLACE FUNCTION public.legacy_plan_allows_feature(p_plan_name text, p_feature_key text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n text := lower(trim(coalesce(p_plan_name, '')));
  is_elite boolean;
  is_pro boolean;
BEGIN
  IF n = '' THEN
    RETURN false;
  END IF;

  is_elite := n LIKE '%elite%';
  is_pro := n LIKE '%studio pro%' OR n LIKE '%stúdio pro%'
    OR (n LIKE '%pro%' AND NOT is_elite) OR n LIKE '%profissional%';

  IF p_feature_key IN ('whatsapp', 'automation', 'finance') THEN
    RETURN is_elite;
  END IF;

  IF p_feature_key IN ('branding', 'waitlist', 'reports') THEN
    RETURN is_pro OR is_elite;
  END IF;

  -- core e demais
  RETURN true;
END;
$$;

-- Resolve plan_id da empresa (assinatura ativa/trial ou companies.plan_id)
CREATE OR REPLACE FUNCTION public.resolve_company_plan_id(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ts.plan_id
      FROM public.tenant_subscriptions ts
      WHERE ts.company_id = p_company_id
        AND ts.status IN ('active', 'trialing', 'past_due')
      ORDER BY ts.updated_at DESC NULLS LAST
      LIMIT 1
    ),
    (SELECT c.plan_id FROM public.companies c WHERE c.id = p_company_id)
  );
$$;

-- Acesso por feature flag (+ fallback se plano sem nenhuma flag configurada)
CREATE OR REPLACE FUNCTION public.company_has_plan_feature(
  p_company_id uuid,
  p_feature_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_name text;
  v_flag_count int;
  v_enabled boolean;
BEGIN
  IF p_company_id IS NULL OR p_feature_key IS NULL OR trim(p_feature_key) = '' THEN
    RETURN false;
  END IF;

  v_plan_id := public.resolve_company_plan_id(p_company_id);
  IF v_plan_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*)::int INTO v_flag_count
  FROM public.plan_features pf
  WHERE pf.plan_id = v_plan_id;

  IF v_flag_count = 0 THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = v_plan_id;
    RETURN public.legacy_plan_allows_feature(v_plan_name, p_feature_key);
  END IF;

  SELECT pf.enabled INTO v_enabled
  FROM public.plan_features pf
  WHERE pf.plan_id = v_plan_id AND pf.feature_key = p_feature_key;

  RETURN coalesce(v_enabled, false);
END;
$$;

REVOKE ALL ON FUNCTION public.company_has_plan_feature(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_plan_feature(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Master: catálogo e edição de flags
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_list_features_catalog()
RETURNS SETOF public.features_catalog
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.features_catalog ORDER BY category, name;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_list_plan_features(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'feature_key', fc.key,
          'name', fc.name,
          'description', fc.description,
          'category', fc.category,
          'enabled', COALESCE(pf.enabled, false),
          'assigned', pf.id IS NOT NULL
        )
        ORDER BY fc.category, fc.name
      )
      FROM public.features_catalog fc
      LEFT JOIN public.plan_features pf
        ON pf.feature_key = fc.key AND pf.plan_id = p_plan_id
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_plan_feature(
  p_plan_id uuid,
  p_feature_key text,
  p_enabled boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.features_catalog WHERE key = p_feature_key) THEN
    RAISE EXCEPTION 'Recurso inválido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.plan_features (plan_id, feature_key, enabled)
  VALUES (p_plan_id, p_feature_key, COALESCE(p_enabled, true))
  ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

  PERFORM public.sync_plan_marketing_features(p_plan_id);

  RETURN public.master_list_plan_features(p_plan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.master_remove_plan_feature(p_plan_id uuid, p_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.plan_features
  WHERE plan_id = p_plan_id AND feature_key = p_feature_key;

  PERFORM public.sync_plan_marketing_features(p_plan_id);

  RETURN public.master_list_plan_features(p_plan_id);
END;
$$;

-- Novos planos: flags base ON por padrão
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
  fk text;
  base_keys text[] := ARRAY['agenda','clients','services','public_booking','history'];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.plans (name, price, features, active)
  VALUES (trim(p_name), p_price, COALESCE(p_features, '[]'::jsonb), COALESCE(p_active, true))
  RETURNING * INTO v_row;

  FOREACH fk IN ARRAY base_keys LOOP
    INSERT INTO public.plan_features (plan_id, feature_key, enabled)
    VALUES (v_row.id, fk, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.plan_features (plan_id, feature_key, enabled)
  SELECT v_row.id, fc.key, false
  FROM public.features_catalog fc
  WHERE fc.key NOT IN ('agenda','clients','services','public_booking','history')
  ON CONFLICT DO NOTHING;

  PERFORM public.sync_plan_marketing_features(v_row.id);

  SELECT * INTO v_row FROM public.plans WHERE id = v_row.id;
  RETURN v_row;
END;
$$;

ALTER FUNCTION public.master_create_plan(text, numeric, jsonb, boolean) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.master_list_features_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_list_plan_features(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_plan_feature(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_remove_plan_feature(uuid, text) TO authenticated;

-- RLS leitura catálogo (público para bullets; escrita só RPC master)
ALTER TABLE public.features_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS features_catalog_select_all ON public.features_catalog;
CREATE POLICY features_catalog_select_all
  ON public.features_catalog FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS plan_features_select_platform_admin ON public.plan_features;
CREATE POLICY plan_features_select_platform_admin
  ON public.plan_features FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

COMMIT;
