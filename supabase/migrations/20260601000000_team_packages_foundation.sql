-- Equipe Elite + Pacotes (Fases 1–5): schema, feature flags e RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Feature catalog
-- ---------------------------------------------------------------------------
INSERT INTO public.features_catalog (key, name, description, category)
VALUES
  ('team', 'Equipe', 'Prestadores bookáveis na agenda e link público.', 'elite'),
  ('packages', 'Pacotes', 'Serviços em pacote com sessões e regras de agendamento.', 'elite'),
  ('commissions', 'Comissões', 'Comissões por prestador (UI futura).', 'elite')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

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

  IF p_feature_key IN ('whatsapp', 'automation', 'finance', 'team', 'packages', 'commissions') THEN
    RETURN is_elite;
  END IF;

  IF p_feature_key IN ('branding', 'waitlist', 'reports') THEN
    RETURN is_pro OR is_elite;
  END IF;

  RETURN true;
END;
$$;

-- Seed elite plan flags
INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, fc.key, fc.key IN ('team', 'packages')
FROM public.plans p
CROSS JOIN public.features_catalog fc
WHERE lower(p.name) LIKE '%elite%'
  AND fc.key IN ('team', 'packages', 'commissions')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS included_provider_slots int,
  ADD COLUMN IF NOT EXISTS extra_provider_slot_price numeric(10, 2);

UPDATE public.plans
SET
  included_provider_slots = COALESCE(NULLIF(included_provider_slots, 0), 3),
  extra_provider_slot_price = COALESCE(extra_provider_slot_price, 17.00)
WHERE lower(name) LIKE '%elite%';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  photo_url text,
  color text,
  is_owner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  default_commission_pct numeric(5, 2),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_providers_company ON public.service_providers (company_id, active);

CREATE TABLE IF NOT EXISTS public.provider_services (
  provider_id uuid NOT NULL REFERENCES public.service_providers (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_services_service ON public.provider_services (service_id);

CREATE TABLE IF NOT EXISTS public.tenant_provider_addons (
  company_id uuid PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  extra_slots int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_company_holidays_company_date ON public.company_holidays (company_id, holiday_date);

CREATE TABLE IF NOT EXISTS public.client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  total_sessions int NOT NULL CHECK (total_sessions > 0),
  used_sessions int NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  paid_at timestamptz,
  expires_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (used_sessions <= total_sessions)
);

CREATE INDEX IF NOT EXISTS idx_client_packages_client ON public.client_packages (client_id, status);
CREATE INDEX IF NOT EXISTS idx_client_packages_company ON public.client_packages (company_id, service_id, status);

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_kind text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS package_sessions int,
  ADD COLUMN IF NOT EXISTS package_allowed_dow jsonb,
  ADD COLUMN IF NOT EXISTS package_max_per_week int,
  ADD COLUMN IF NOT EXISTS package_valid_days int;

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_service_kind_check;
ALTER TABLE public.services
  ADD CONSTRAINT services_service_kind_check CHECK (service_kind IN ('single', 'package'));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_package_id uuid REFERENCES public.client_packages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_session_number int;

CREATE INDEX IF NOT EXISTS idx_appointments_provider ON public.appointments (company_id, provider_id, appointment_date);

DROP TRIGGER IF EXISTS trg_service_providers_updated_at ON public.service_providers;
CREATE TRIGGER trg_service_providers_updated_at
  BEFORE UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_client_packages_updated_at ON public.client_packages;
CREATE TRIGGER trg_client_packages_updated_at
  BEFORE UPDATE ON public.client_packages
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_provider_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_providers_tenant ON public.service_providers;
CREATE POLICY service_providers_tenant ON public.service_providers
  FOR ALL USING (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

DROP POLICY IF EXISTS provider_services_tenant ON public.provider_services;
CREATE POLICY provider_services_tenant ON public.provider_services
  FOR ALL USING (
    provider_id IN (
      SELECT sp.id FROM public.service_providers sp
      WHERE sp.company_id IN (SELECT public.current_user_company_ids())
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT sp.id FROM public.service_providers sp
      WHERE sp.company_id IN (SELECT public.current_user_company_ids())
    )
  );

DROP POLICY IF EXISTS tenant_provider_addons_tenant ON public.tenant_provider_addons;
CREATE POLICY tenant_provider_addons_tenant ON public.tenant_provider_addons
  FOR ALL USING (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

DROP POLICY IF EXISTS company_holidays_tenant ON public.company_holidays;
CREATE POLICY company_holidays_tenant ON public.company_holidays
  FOR ALL USING (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

DROP POLICY IF EXISTS client_packages_tenant ON public.client_packages;
CREATE POLICY client_packages_tenant ON public.client_packages
  FOR ALL USING (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_team_admin_for_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required';
  END IF;

  IF public.is_platform_admin() THEN
    RETURN;
  END IF;

  IF NOT (p_company_id IN (SELECT public.current_user_owner_admin_company_ids())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.company_has_plan_feature(p_company_id, 'team') THEN
    RAISE EXCEPTION 'plan_feature_team_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_team_admin_for_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_team_admin_for_company(uuid) TO authenticated;

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
BEGIN
  v_plan_id := public.resolve_company_plan_id(p_company_id);
  IF v_plan_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(p.included_provider_slots, 0), 3) INTO v_included
    FROM public.plans p WHERE p.id = v_plan_id;
  END IF;

  SELECT COALESCE(tpa.extra_slots, 0) INTO v_extra
  FROM public.tenant_provider_addons tpa
  WHERE tpa.company_id = p_company_id;

  RETURN GREATEST(v_included + v_extra, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.company_provider_slot_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_provider_slot_limit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_company_holiday(p_company_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_holidays ch
    WHERE ch.company_id = p_company_id AND ch.holiday_date = p_date
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin: prestadores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_service_providers(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  v_limit := public.company_provider_slot_limit(p_company_id);
  SELECT count(*)::int INTO v_count
  FROM public.service_providers sp
  WHERE sp.company_id = p_company_id AND sp.active = true;

  RETURN json_build_object(
    'ok', true,
    'slot_limit', v_limit,
    'active_count', v_count,
    'providers', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.sort_order, x.display_name)
      FROM (
        SELECT
          sp.id,
          sp.company_id,
          sp.display_name,
          sp.photo_url,
          sp.color,
          sp.is_owner,
          sp.active,
          sp.default_commission_pct,
          sp.sort_order,
          COALESCE((
            SELECT json_agg(ps.service_id)
            FROM public.provider_services ps
            WHERE ps.provider_id = sp.id
          ), '[]'::json) AS service_ids
        FROM public.service_providers sp
        WHERE sp.company_id = p_company_id
        ORDER BY sp.sort_order, sp.display_name
      ) x
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_service_provider(
  p_company_id uuid,
  p_provider_id uuid,
  p_display_name text,
  p_photo_url text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_is_owner boolean DEFAULT false,
  p_active boolean DEFAULT true,
  p_default_commission_pct numeric DEFAULT NULL,
  p_sort_order int DEFAULT 0,
  p_service_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_limit int;
  v_active_count int;
  v_sid uuid;
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'nome_obrigatorio');
  END IF;

  v_limit := public.company_provider_slot_limit(p_company_id);

  IF p_provider_id IS NULL THEN
    SELECT count(*)::int INTO v_active_count
    FROM public.service_providers sp
    WHERE sp.company_id = p_company_id AND sp.active = true;

    IF p_active AND v_active_count >= v_limit THEN
      RETURN json_build_object('ok', false, 'error', 'limite_prestadores', 'slot_limit', v_limit);
    END IF;

    INSERT INTO public.service_providers (
      company_id, display_name, photo_url, color, is_owner, active,
      default_commission_pct, sort_order
    )
    VALUES (
      p_company_id, trim(p_display_name), NULLIF(trim(p_photo_url), ''), NULLIF(trim(p_color), ''),
      COALESCE(p_is_owner, false), COALESCE(p_active, true),
      p_default_commission_pct, COALESCE(p_sort_order, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    IF p_active THEN
      SELECT count(*)::int INTO v_active_count
      FROM public.service_providers sp
      WHERE sp.company_id = p_company_id AND sp.active = true AND sp.id <> p_provider_id;

      IF v_active_count >= v_limit THEN
        RETURN json_build_object('ok', false, 'error', 'limite_prestadores', 'slot_limit', v_limit);
      END IF;
    END IF;

    UPDATE public.service_providers sp
    SET
      display_name = trim(p_display_name),
      photo_url = NULLIF(trim(p_photo_url), ''),
      color = NULLIF(trim(p_color), ''),
      is_owner = COALESCE(p_is_owner, sp.is_owner),
      active = COALESCE(p_active, sp.active),
      default_commission_pct = p_default_commission_pct,
      sort_order = COALESCE(p_sort_order, sp.sort_order),
      updated_at = now()
    WHERE sp.id = p_provider_id AND sp.company_id = p_company_id
    RETURNING sp.id INTO v_id;

    IF v_id IS NULL THEN
      RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
    END IF;
  END IF;

  DELETE FROM public.provider_services ps WHERE ps.provider_id = v_id;

  IF p_service_ids IS NOT NULL THEN
    FOREACH v_sid IN ARRAY p_service_ids LOOP
      IF EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.id = v_sid AND s.company_id = p_company_id
      ) THEN
        INSERT INTO public.provider_services (provider_id, service_id)
        VALUES (v_id, v_sid)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN json_build_object('ok', true, 'provider_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_service_provider(p_company_id uuid, p_provider_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  DELETE FROM public.service_providers sp
  WHERE sp.id = p_provider_id AND sp.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_service_providers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_service_providers(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_upsert_service_provider(uuid, uuid, text, text, text, boolean, boolean, numeric, int, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_service_provider(uuid, uuid, text, text, text, boolean, boolean, numeric, int, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_service_provider(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_service_provider(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Pacotes: admin + lookup público
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activate_client_package(
  p_company_id uuid,
  p_client_id uuid,
  p_service_id uuid,
  p_total_sessions int DEFAULT NULL,
  p_expires_at date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_svc public.services%ROWTYPE;
  v_pkg_id uuid;
  v_total int;
BEGIN
  IF p_company_id IS NULL OR p_client_id IS NULL OR p_service_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (p_company_id IN (SELECT public.current_user_owner_admin_company_ids()) OR public.is_platform_admin()) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT public.company_has_plan_feature(p_company_id, 'packages') THEN
    RETURN json_build_object('ok', false, 'error', 'plan_feature_packages_required');
  END IF;

  SELECT * INTO v_svc
  FROM public.services s
  WHERE s.id = p_service_id AND s.company_id = p_company_id AND s.service_kind = 'package';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'servico_pacote_invalido');
  END IF;

  v_total := COALESCE(p_total_sessions, v_svc.package_sessions);
  IF v_total IS NULL OR v_total <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'sessoes_invalidas');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.company_id = p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'cliente_invalido');
  END IF;

  INSERT INTO public.client_packages (
    company_id, client_id, service_id, total_sessions, used_sessions,
    status, paid_at, expires_at, notes
  )
  VALUES (
    p_company_id, p_client_id, p_service_id, v_total, 0,
    'active', now(),
    COALESCE(p_expires_at, CASE WHEN v_svc.package_valid_days IS NOT NULL
      THEN (current_date + v_svc.package_valid_days) ELSE NULL END),
    p_notes
  )
  RETURNING id INTO v_pkg_id;

  RETURN json_build_object('ok', true, 'client_package_id', v_pkg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_client_packages(
  p_company_id uuid,
  p_client_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_company_id IN (SELECT public.current_user_company_ids()) OR public.is_platform_admin()) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'packages', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          cp.id,
          cp.client_id,
          c.name AS client_name,
          cp.service_id,
          s.name AS service_name,
          cp.total_sessions,
          cp.used_sessions,
          cp.status,
          cp.paid_at,
          cp.expires_at,
          cp.notes,
          cp.created_at
        FROM public.client_packages cp
        JOIN public.clients c ON c.id = cp.client_id
        JOIN public.services s ON s.id = cp.service_id
        WHERE cp.company_id = p_company_id
          AND (p_client_id IS NULL OR cp.client_id = p_client_id)
      ) x
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_client_package(
  p_slug text,
  p_whatsapp text,
  p_service_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  svc public.services%ROWTYPE;
  v_phone text;
  v_client_id uuid;
  v_pkg public.client_packages%ROWTYPE;
  v_holidays json;
  v_is_last boolean;
BEGIN
  IF p_slug IS NULL OR p_service_id IS NULL OR p_whatsapp IS NULL OR length(trim(p_whatsapp)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT * INTO svc
  FROM public.services s
  WHERE s.id = p_service_id AND s.company_id = comp.id AND s.active = true AND s.service_kind = 'package';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  v_phone := public.norm_phone(p_whatsapp);
  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_invalido');
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients cl
  WHERE cl.company_id = comp.id AND public.norm_phone(cl.whatsapp) = v_phone
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN json_build_object('ok', true, 'found', false, 'error', 'pacote_nao_encontrado');
  END IF;

  SELECT * INTO v_pkg
  FROM public.client_packages cp
  WHERE cp.company_id = comp.id
    AND cp.client_id = v_client_id
    AND cp.service_id = p_service_id
    AND cp.status = 'active'
    AND cp.used_sessions < cp.total_sessions
    AND (cp.expires_at IS NULL OR cp.expires_at >= current_date)
  ORDER BY cp.paid_at NULLS LAST, cp.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', true, 'found', false, 'error', 'pacote_nao_encontrado');
  END IF;

  v_is_last := (v_pkg.used_sessions + 1 = v_pkg.total_sessions);

  SELECT COALESCE(json_agg(ch.holiday_date::text ORDER BY ch.holiday_date), '[]'::json)
  INTO v_holidays
  FROM public.company_holidays ch
  WHERE ch.company_id = comp.id
    AND ch.holiday_date >= current_date
    AND ch.holiday_date <= current_date + 120;

  RETURN json_build_object(
    'ok', true,
    'found', true,
    'client_package_id', v_pkg.id,
    'client_name', (SELECT name FROM public.clients WHERE id = v_client_id),
    'used_sessions', v_pkg.used_sessions,
    'total_sessions', v_pkg.total_sessions,
    'remaining', v_pkg.total_sessions - v_pkg.used_sessions,
    'session_label', (v_pkg.used_sessions + 1)::text || '/' || v_pkg.total_sessions::text,
    'is_last_session', v_is_last,
    'allowed_dow', COALESCE(svc.package_allowed_dow, '[]'::jsonb),
    'max_per_week', COALESCE(svc.package_max_per_week, 1),
    'holidays', v_holidays,
    'expires_at', v_pkg.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_providers(p_slug text, p_service_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  comp public.companies%ROWTYPE;
BEGIN
  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND OR NOT public.company_has_plan_feature(comp.id, 'team') THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', sp.id,
      'display_name', sp.display_name,
      'photo_url', sp.photo_url,
      'color', sp.color,
      'is_owner', sp.is_owner
    ) ORDER BY sp.sort_order, sp.display_name)
    FROM public.service_providers sp
    JOIN public.provider_services ps ON ps.provider_id = sp.id
    WHERE sp.company_id = comp.id
      AND sp.active = true
      AND ps.service_id = p_service_id
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_activate_client_package(uuid, uuid, uuid, int, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_activate_client_package(uuid, uuid, uuid, int, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_client_packages(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_client_packages(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.lookup_client_package(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_client_package(text, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.list_public_providers(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_providers(text, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_booking_page_data — flags + campos de pacote
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_page_data(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_slug text;
  c public.companies%ROWTYPE;
  b public.branding_settings%ROWTYPE;
  j json;
  v_whatsapp_available boolean;
  v_team boolean;
  v_packages boolean;
BEGIN
  v_slug := public.normalize_booking_slug(p_slug);
  IF v_slug IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO c FROM public.companies WHERE slug = v_slug;

  IF NOT FOUND OR NOT public.company_eligible_for_public_booking(c.id) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO b FROM public.branding_settings WHERE company_id = c.id;

  v_whatsapp_available := public.company_has_plan_feature(c.id, 'whatsapp')
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_connections wc
      WHERE wc.company_id = c.id AND wc.status = 'active'
        AND wc.access_token_encrypted IS NOT NULL
        AND length(trim(wc.access_token_encrypted)) > 0
    );

  v_team := public.company_has_plan_feature(c.id, 'team');
  v_packages := public.company_has_plan_feature(c.id, 'packages');

  SELECT COALESCE((
    SELECT json_agg(svc.obj)
    FROM (
      SELECT json_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'price', s.price,
        'duration_minutes', s.duration_minutes,
        'buffer_minutes', s.buffer_minutes,
        'image_url', s.image_url,
        'category', s.category,
        'service_kind', s.service_kind,
        'package_sessions', s.package_sessions,
        'package_allowed_dow', s.package_allowed_dow,
        'package_max_per_week', s.package_max_per_week
      ) AS obj
      FROM public.services s
      WHERE s.company_id = c.id AND s.active = true
      ORDER BY s.name
    ) svc
  ), '[]'::json) INTO j;

  RETURN json_build_object(
    'company', json_build_object(
      'id', c.id, 'name', c.name, 'slug', c.slug,
      'email', c.email, 'phone', c.phone, 'status', c.status
    ),
    'branding', CASE
      WHEN b.id IS NULL THEN NULL::json
      ELSE (to_jsonb(b) - 'id' - 'company_id' - 'created_at' - 'updated_at')::json
    END,
    'services', j,
    'whatsapp_notifications_available', v_whatsapp_available,
    'team_enabled', v_team,
    'packages_enabled', v_packages
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_available_slots — filtro por prestador
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_available_slots(text, uuid, date);

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_provider_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  svc public.services%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  v_interval integer;
  v_notice integer;
  v_open time;
  v_close time;
  v_working jsonb;
  v_service_minutes integer;
  v_day_index integer;
  v_dow int;
  slots json;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 OR p_service_id IS NULL OR p_date IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  SELECT * INTO svc
  FROM public.services
  WHERE id = p_service_id AND company_id = comp.id AND active = true;

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  IF svc.service_kind = 'package' AND public.is_company_holiday(comp.id, p_date) THEN
    RETURN '[]'::json;
  END IF;

  IF svc.service_kind = 'package' AND svc.package_allowed_dow IS NOT NULL
     AND jsonb_typeof(svc.package_allowed_dow) = 'array'
     AND jsonb_array_length(svc.package_allowed_dow) > 0 THEN
    v_dow := extract(isodow from p_date)::int;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(svc.package_allowed_dow) elem
      WHERE (elem #>> '{}')::int = v_dow
    ) THEN
      RETURN '[]'::json;
    END IF;
  END IF;

  SELECT * INTO bs FROM public.business_settings WHERE company_id = comp.id;

  v_interval := COALESCE(bs.slot_interval_minutes, 15);
  v_notice := COALESCE(bs.min_schedule_notice_hours, 2);
  v_open := COALESCE(bs.opening_time, '09:00'::time);
  v_close := COALESCE(bs.closing_time, '19:00'::time);
  v_working := COALESCE(bs.working_days, '[true,true,true,true,true,true,false]'::jsonb);

  v_day_index := (extract(isodow from p_date)::int - 1);
  IF jsonb_typeof(v_working) = 'array' AND jsonb_array_length(v_working) = 7 THEN
    IF COALESCE((v_working ->> v_day_index)::boolean, false) = false THEN
      RETURN '[]'::json;
    END IF;
  END IF;

  v_service_minutes := COALESCE(svc.duration_minutes, 0) + COALESCE(svc.buffer_minutes, 0);
  IF v_service_minutes <= 0 THEN
    RETURN '[]'::json;
  END IF;

  WITH
  cfg AS (
    SELECT
      (p_date::timestamp + v_open) AS open_ts,
      (p_date::timestamp + v_close) AS close_ts,
      make_interval(mins => v_interval) AS step,
      make_interval(mins => v_service_minutes) AS svc_len,
      (now() + make_interval(hours => v_notice)) AS min_ts
  ),
  blocks AS (
    SELECT
      CASE
        WHEN sb.block_type = 'manual_block' THEN (p_date::timestamp + sb.time_start)
        WHEN sb.block_type = 'morning_full' THEN (p_date::timestamp + v_open)
        WHEN sb.block_type = 'afternoon_full' THEN (p_date::timestamp + (v_open + ((v_close - v_open) / 2)))
        WHEN sb.block_type = 'day_full' THEN (p_date::timestamp + v_open)
        ELSE (p_date::timestamp + v_open)
      END AS b_start,
      CASE
        WHEN sb.block_type = 'manual_block' THEN (p_date::timestamp + sb.time_end)
        WHEN sb.block_type = 'morning_full' THEN (p_date::timestamp + (v_open + ((v_close - v_open) / 2)))
        WHEN sb.block_type = 'afternoon_full' THEN (p_date::timestamp + v_close)
        WHEN sb.block_type = 'day_full' THEN (p_date::timestamp + v_close)
        ELSE (p_date::timestamp + v_close)
      END AS b_end
    FROM public.schedule_blocks sb
    WHERE sb.company_id = comp.id AND sb.block_date = p_date
  ),
  appts AS (
    SELECT
      (p_date::timestamp + a.appointment_time) AS a_start,
      (p_date::timestamp + a.appointment_time)
        + make_interval(mins => (COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0))) AS a_end
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.company_id = comp.id
      AND a.appointment_date = p_date
      AND a.status <> 'cancelled'
      AND (
        p_provider_id IS NULL
        OR a.provider_id IS NULL
        OR a.provider_id = p_provider_id
      )
  ),
  candidates AS (
    SELECT gs AS start_ts, (gs + (SELECT svc_len FROM cfg)) AS end_ts
    FROM cfg,
      generate_series(
        (SELECT open_ts FROM cfg),
        (SELECT close_ts FROM cfg) - (SELECT svc_len FROM cfg),
        (SELECT step FROM cfg)
      ) AS gs
  ),
  available AS (
    SELECT start_ts
    FROM candidates c, cfg
    WHERE c.start_ts >= cfg.min_ts
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE c.start_ts < b.b_end AND c.end_ts > b.b_start)
      AND NOT EXISTS (SELECT 1 FROM appts a WHERE c.start_ts < a.a_end AND c.end_ts > a.a_start)
  )
  SELECT COALESCE(json_agg(to_char(start_ts, 'HH24:MI') ORDER BY start_ts), '[]'::json)
  INTO slots FROM available;

  RETURN slots;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(text, uuid, date, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_public_booking — prestador + pacote
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text,
  p_notes text DEFAULT NULL,
  p_whatsapp_notifications boolean DEFAULT false,
  p_provider_id uuid DEFAULT NULL,
  p_client_package_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  svc public.services%ROWTYPE;
  v_client_id uuid;
  v_appt_id uuid;
  v_email text;
  v_phone text;
  v_slot text;
  v_time time;
  v_start timestamp;
  v_end timestamp;
  v_whatsapp_log_id uuid;
  v_whatsapp_send_token text;
  v_phone_out text;
  v_pkg public.client_packages%ROWTYPE;
  v_session_num int;
  v_week_count int;
  v_dow int;
  v_team boolean;
  v_provider_count int;
BEGIN
  PERFORM set_config('timezone', 'America/Sao_Paulo', true);

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'slug_obrigatorio');
  END IF;

  IF p_service_id IS NULL OR p_appointment_date IS NULL OR p_appointment_time IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'nome_obrigatorio');
  END IF;

  IF p_client_whatsapp IS NULL OR length(trim(p_client_whatsapp)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_obrigatorio');
  END IF;

  v_time := p_appointment_time::time;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT * INTO svc
  FROM public.services
  WHERE id = p_service_id AND company_id = comp.id AND active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  v_team := public.company_has_plan_feature(comp.id, 'team');

  IF v_team THEN
    SELECT count(*)::int INTO v_provider_count
    FROM public.service_providers sp
    JOIN public.provider_services ps ON ps.provider_id = sp.id
    WHERE sp.company_id = comp.id AND sp.active = true AND ps.service_id = p_service_id;

    IF v_provider_count > 0 AND p_provider_id IS NULL THEN
      RETURN json_build_object('ok', false, 'error', 'prestador_obrigatorio');
    END IF;

    IF p_provider_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.service_providers sp
      JOIN public.provider_services ps ON ps.provider_id = sp.id
      WHERE sp.id = p_provider_id AND sp.company_id = comp.id AND sp.active = true
        AND ps.service_id = p_service_id
    ) THEN
      RETURN json_build_object('ok', false, 'error', 'prestador_invalido');
    END IF;
  END IF;

  IF svc.service_kind = 'package' THEN
    IF p_client_package_id IS NULL THEN
      RETURN json_build_object('ok', false, 'error', 'pacote_obrigatorio');
    END IF;

    SELECT * INTO v_pkg
    FROM public.client_packages cp
    WHERE cp.id = p_client_package_id AND cp.company_id = comp.id AND cp.service_id = p_service_id;

    IF NOT FOUND OR v_pkg.status <> 'active' OR v_pkg.used_sessions >= v_pkg.total_sessions THEN
      RETURN json_build_object('ok', false, 'error', 'pacote_invalido');
    END IF;

    IF v_pkg.expires_at IS NOT NULL AND v_pkg.expires_at < p_appointment_date THEN
      RETURN json_build_object('ok', false, 'error', 'pacote_expirado');
    END IF;

    IF public.is_company_holiday(comp.id, p_appointment_date) THEN
      RETURN json_build_object('ok', false, 'error', 'data_feriado');
    END IF;

    IF svc.package_allowed_dow IS NOT NULL AND jsonb_typeof(svc.package_allowed_dow) = 'array'
       AND jsonb_array_length(svc.package_allowed_dow) > 0 THEN
      v_dow := extract(isodow from p_appointment_date)::int;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(svc.package_allowed_dow) elem
        WHERE (elem #>> '{}')::int = v_dow
      ) THEN
        RETURN json_build_object('ok', false, 'error', 'dia_nao_permitido');
      END IF;
    END IF;

    IF COALESCE(svc.package_max_per_week, 1) > 0 THEN
      SELECT count(*)::int INTO v_week_count
      FROM public.appointments a
      WHERE a.client_package_id = v_pkg.id
        AND a.status <> 'cancelled'
        AND a.appointment_date >= date_trunc('week', p_appointment_date)::date
        AND a.appointment_date < date_trunc('week', p_appointment_date)::date + 7;

      IF v_week_count >= COALESCE(svc.package_max_per_week, 1) THEN
        RETURN json_build_object('ok', false, 'error', 'limite_semanal_pacote');
      END IF;
    END IF;

    v_session_num := v_pkg.used_sessions + 1;
  END IF;

  v_slot := to_char(v_time, 'HH24:MI');
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements_text(
      public.get_available_slots(public.normalize_booking_slug(p_slug), p_service_id, p_appointment_date, p_provider_id)::json
    ) elem
    WHERE elem = v_slot
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  v_start := (p_appointment_date::timestamp + v_time);
  v_end := v_start + make_interval(mins => (COALESCE(svc.duration_minutes, 0) + COALESCE(svc.buffer_minutes, 0)));

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.company_id = comp.id AND a.appointment_date = p_appointment_date
      AND a.status <> 'cancelled'
      AND (p_provider_id IS NULL OR a.provider_id IS NULL OR a.provider_id = p_provider_id)
      AND v_start < (p_appointment_date::timestamp + a.appointment_time)
        + make_interval(mins => (COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0)))
      AND v_end > (p_appointment_date::timestamp + a.appointment_time)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  v_email := NULLIF(lower(trim(p_client_email)), '');
  v_phone := public.norm_phone(p_client_whatsapp);

  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_invalido');
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_client_id FROM public.clients
    WHERE company_id = comp.id AND lower(trim(coalesce(email, ''))) = v_email LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    SELECT id INTO v_client_id FROM public.clients
    WHERE company_id = comp.id AND public.norm_phone(whatsapp) = v_phone LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (company_id, name, email, whatsapp, notes)
    VALUES (comp.id, trim(p_client_name), v_email, NULLIF(trim(p_client_whatsapp), ''), p_notes)
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients SET
      name = COALESCE(NULLIF(trim(p_client_name), ''), name),
      email = COALESCE(v_email, email),
      whatsapp = COALESCE(NULLIF(trim(p_client_whatsapp), ''), whatsapp),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
    WHERE id = v_client_id;
  END IF;

  IF svc.service_kind = 'package' AND v_pkg.client_id <> v_client_id THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_cliente_divergente');
  END IF;

  INSERT INTO public.appointments (
    company_id, client_id, service_id, appointment_date, appointment_time, status,
    provider_id, client_package_id, package_session_number
  )
  VALUES (
    comp.id, v_client_id, p_service_id, p_appointment_date, v_time, 'scheduled',
    p_provider_id, p_client_package_id, v_session_num
  )
  RETURNING id INTO v_appt_id;

  IF svc.service_kind = 'package' AND p_client_package_id IS NOT NULL THEN
    UPDATE public.client_packages SET
      used_sessions = used_sessions + 1,
      status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'completed' ELSE status END,
      updated_at = now()
    WHERE id = p_client_package_id;
  END IF;

  IF COALESCE(p_whatsapp_notifications, false) AND v_phone IS NOT NULL THEN
    v_phone_out := COALESCE(v_phone, public.norm_phone(p_client_whatsapp));
    v_whatsapp_log_id := public.queue_whatsapp_booking_confirmation(
      comp.id, v_appt_id, v_client_id, COALESCE(v_phone_out, trim(p_client_whatsapp))
    );
    IF v_whatsapp_log_id IS NOT NULL THEN
      SELECT payload->>'send_token' INTO v_whatsapp_send_token
      FROM public.whatsapp_message_logs WHERE id = v_whatsapp_log_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'client_id', v_client_id,
    'company_id', comp.id,
    'appointment_date', p_appointment_date,
    'appointment_time', v_slot,
    'package_session_number', v_session_num,
    'package_total_sessions', v_pkg.total_sessions,
    'is_last_package_session', (v_session_num = v_pkg.total_sessions),
    'whatsapp_queued', (v_whatsapp_log_id IS NOT NULL),
    'whatsapp_log_id', v_whatsapp_log_id,
    'whatsapp_send_token', v_whatsapp_send_token
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
  text, uuid, date, time, text, text, text, text, boolean, uuid, uuid
) TO anon, authenticated;

-- Portal cliente: inclui pacotes (mantém formato upcoming/history existente)
CREATE OR REPLACE FUNCTION public.get_client_portal_data(
  p_slug text,
  p_email text,
  p_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_company_id uuid;
  v_phone text;
  v_client_id uuid;
  v_client_name text;
  v_client_whatsapp text;
  upcoming json;
  history json;
  v_packages json;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'slug_obrigatorio');
  END IF;

  v_phone := public.norm_phone(p_whatsapp);
  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_obrigatorio');
  END IF;

  v_company_id := public.resolve_public_company_id(p_slug);
  IF v_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT * INTO comp FROM public.companies WHERE id = v_company_id;

  SELECT c.id, c.name, c.whatsapp
  INTO v_client_id, v_client_name, v_client_whatsapp
  FROM public.clients c
  WHERE c.company_id = comp.id AND public.norm_phone(c.whatsapp) = v_phone
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN json_build_object(
      'ok', true,
      'company', json_build_object('name', comp.name, 'slug', comp.slug),
      'client', NULL,
      'packages', '[]'::json,
      'upcoming', '[]'::json,
      'history', '[]'::json
    );
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.status, x.service_name), '[]'::json)
  INTO v_packages
  FROM (
    SELECT
      cp.id,
      cp.service_id,
      s.name AS service_name,
      cp.total_sessions,
      cp.used_sessions,
      cp.status,
      cp.expires_at,
      (cp.used_sessions::text || '/' || cp.total_sessions::text) AS session_label,
      (cp.total_sessions - cp.used_sessions) AS remaining
    FROM public.client_packages cp
    JOIN public.services s ON s.id = cp.service_id
    WHERE cp.client_id = v_client_id AND cp.company_id = comp.id
      AND cp.status IN ('active', 'completed')
  ) x;

  SELECT COALESCE(json_agg(obj ORDER BY obj->>'start_at'), '[]'::json)
  INTO upcoming
  FROM (
    SELECT json_build_object(
      'id', a.id,
      'service_id', a.service_id,
      'service', s.name,
      'status', a.status,
      'date', a.appointment_date,
      'time', to_char(a.appointment_time, 'HH24:MI'),
      'rating', r.rating,
      'provider_name', sp.display_name,
      'package_session_number', a.package_session_number,
      'package_total_sessions', cp.total_sessions,
      'start_at', (a.appointment_date::timestamp + a.appointment_time)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.appointment_ratings r ON r.appointment_id = a.id
    LEFT JOIN public.service_providers sp ON sp.id = a.provider_id
    LEFT JOIN public.client_packages cp ON cp.id = a.client_package_id
    WHERE a.company_id = comp.id AND a.client_id = v_client_id
      AND a.status IN ('scheduled', 'confirmed')
      AND (a.appointment_date::timestamp + a.appointment_time) >= now() - interval '1 hour'
    ORDER BY a.appointment_date, a.appointment_time
    LIMIT 20
  ) q;

  SELECT COALESCE(json_agg(obj ORDER BY (obj->>'start_at') DESC), '[]'::json)
  INTO history
  FROM (
    SELECT json_build_object(
      'id', a.id,
      'service_id', a.service_id,
      'service', s.name,
      'status', a.status,
      'date', a.appointment_date,
      'time', to_char(a.appointment_time, 'HH24:MI'),
      'rating', r.rating,
      'provider_name', sp.display_name,
      'package_session_number', a.package_session_number,
      'start_at', (a.appointment_date::timestamp + a.appointment_time)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.appointment_ratings r ON r.appointment_id = a.id
    LEFT JOIN public.service_providers sp ON sp.id = a.provider_id
    WHERE a.company_id = comp.id AND a.client_id = v_client_id
      AND (a.appointment_date::timestamp + a.appointment_time) < now() + interval '1 hour'
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
    LIMIT 100
  ) q;

  RETURN json_build_object(
    'ok', true,
    'company', json_build_object('name', comp.name, 'slug', comp.slug),
    'client', json_build_object('name', v_client_name, 'whatsapp', v_client_whatsapp),
    'packages', v_packages,
    'upcoming', upcoming,
    'history', history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_portal_data(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_page_data(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
