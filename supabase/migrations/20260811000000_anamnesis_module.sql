-- Anamnese: módulo isolado (não altera create_public_booking).
-- OTP WhatsApp + senha opcional por cliente/salão + link mágico + require por serviço.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Helpers de acesso (criados só se faltarem — ex.: 20260616 não aplicada no projeto)
-- ---------------------------------------------------------------------------
DO $bootstrap$
BEGIN
  IF to_regprocedure('public.company_subscription_allows_panel_access(uuid)') IS NULL THEN
    IF to_regprocedure('public.company_eligible_for_public_booking(uuid)') IS NOT NULL THEN
      EXECUTE $fn$
        CREATE FUNCTION public.company_subscription_allows_panel_access(p_company_id uuid)
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public
        AS $body$
          SELECT public.company_eligible_for_public_booking(p_company_id);
        $body$;
      $fn$;
    ELSE
      EXECUTE $fn$
        CREATE FUNCTION public.company_subscription_allows_panel_access(p_company_id uuid)
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public
        AS $body$
          SELECT p_company_id IS NOT NULL;
        $body$;
      $fn$;
    END IF;
    EXECUTE 'REVOKE ALL ON FUNCTION public.company_subscription_allows_panel_access(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.company_subscription_allows_panel_access(uuid) TO authenticated';
  END IF;

  IF to_regprocedure('public.user_can_access_company_panel(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.user_can_access_company_panel(p_company_id uuid)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      SET row_security = off
      AS $body$
        SELECT
          public.is_platform_admin()
          OR (
            p_company_id IN (SELECT public.current_user_company_ids())
            AND public.company_subscription_allows_panel_access(p_company_id)
          );
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.user_can_access_company_panel(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.user_can_access_company_panel(uuid) TO authenticated';
  END IF;

  IF to_regprocedure('public.user_can_read_client(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.user_can_read_client(p_company_id uuid, p_client_id uuid)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      SET row_security = off
      AS $body$
        SELECT public.user_can_access_company_panel(p_company_id);
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.user_can_read_client(uuid, uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.user_can_read_client(uuid, uuid) TO authenticated';
  END IF;

  IF to_regprocedure('public.user_can_update_client(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.user_can_update_client(p_company_id uuid, p_client_id uuid)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      SET row_security = off
      AS $body$
        SELECT public.user_can_access_company_panel(p_company_id);
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.user_can_update_client(uuid, uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.user_can_update_client(uuid, uuid) TO authenticated';
  END IF;
END;
$bootstrap$;

-- ---------------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------------
INSERT INTO public.features_catalog (key, name, description, category)
VALUES (
  'anamnesis',
  'Anamnese',
  'Ficha de anamnese preenchida pela cliente com histórico e OTP.',
  'growth'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, 'anamnesis', true
FROM public.plans p
WHERE
  lower(p.name) LIKE '%elite%'
  OR lower(p.name) LIKE '%pro%'
  OR lower(p.name) LIKE '%profissional%'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- ---------------------------------------------------------------------------
-- Columns on services / clients
-- ---------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS require_anamnesis boolean NOT NULL DEFAULT false;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_anamnesis_at timestamptz,
  ADD COLUMN IF NOT EXISTS anamnesis_status text;

COMMENT ON COLUMN public.services.require_anamnesis IS 'Se true, atendimento deste serviço recomenda/exige ficha de anamnese válida.';
COMMENT ON COLUMN public.clients.anamnesis_status IS 'Cache: missing | valid | expired | null';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anamnesis_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Anamnese padrão',
  version int NOT NULL DEFAULT 1,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  validity_months int NOT NULL DEFAULT 12 CHECK (validity_months > 0 AND validity_months <= 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anamnesis_templates_company
  ON public.anamnesis_templates (company_id) WHERE active;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS anamnesis_template_id uuid REFERENCES public.anamnesis_templates (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.anamnesis_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.anamnesis_templates (id) ON DELETE RESTRICT,
  template_version int NOT NULL DEFAULT 1,
  appointment_id uuid REFERENCES public.appointments (id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  filled_by text NOT NULL DEFAULT 'client' CHECK (filled_by IN ('client', 'staff')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'reviewed')),
  consent_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anamnesis_submissions_client
  ON public.anamnesis_submissions (company_id, client_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.anamnesis_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  phone_norm text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anamnesis_otps_lookup
  ON public.anamnesis_otps (company_id, phone_norm, created_at DESC);

CREATE TABLE IF NOT EXISTS public.anamnesis_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  appointment_id uuid REFERENCES public.appointments (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.anamnesis_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anamnesis_sessions_hash
  ON public.anamnesis_sessions (session_token_hash);

CREATE TABLE IF NOT EXISTS public.client_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_id)
);

DROP TRIGGER IF EXISTS trg_anamnesis_templates_updated_at ON public.anamnesis_templates;
CREATE TRIGGER trg_anamnesis_templates_updated_at
  BEFORE UPDATE ON public.anamnesis_templates
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS trg_client_credentials_updated_at ON public.client_credentials;
CREATE TRIGGER trg_client_credentials_updated_at
  BEFORE UPDATE ON public.client_credentials
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.anamnesis_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anamnesis_templates_tenant ON public.anamnesis_templates;
CREATE POLICY anamnesis_templates_tenant ON public.anamnesis_templates
  FOR ALL TO authenticated
  USING (public.user_can_access_company_panel(company_id))
  WITH CHECK (public.user_can_access_company_panel(company_id));

DROP POLICY IF EXISTS anamnesis_submissions_select ON public.anamnesis_submissions;
CREATE POLICY anamnesis_submissions_select ON public.anamnesis_submissions
  FOR SELECT TO authenticated
  USING (public.user_can_read_client(company_id, client_id));

DROP POLICY IF EXISTS anamnesis_submissions_write ON public.anamnesis_submissions;
CREATE POLICY anamnesis_submissions_write ON public.anamnesis_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_update_client(company_id, client_id)
    AND public.company_has_plan_feature(company_id, 'anamnesis')
  );

-- OTP / tokens / sessions / credentials: sem acesso direto do client JS (só via RPC)
DROP POLICY IF EXISTS anamnesis_otps_deny ON public.anamnesis_otps;
CREATE POLICY anamnesis_otps_deny ON public.anamnesis_otps FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS anamnesis_access_tokens_deny ON public.anamnesis_access_tokens;
CREATE POLICY anamnesis_access_tokens_deny ON public.anamnesis_access_tokens FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS anamnesis_sessions_deny ON public.anamnesis_sessions;
CREATE POLICY anamnesis_sessions_deny ON public.anamnesis_sessions FOR ALL TO authenticated USING (false);

DROP POLICY IF EXISTS client_credentials_deny ON public.client_credentials;
CREATE POLICY client_credentials_deny ON public.client_credentials FOR ALL TO authenticated USING (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anamnesis_default_schema()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{
    "fields": [
      {"id": "alergias", "type": "text", "label": "Possui alergias? Quais?", "required": true},
      {"id": "medicamentos", "type": "text", "label": "Usa medicamentos contínuos?", "required": false},
      {"id": "gestante", "type": "boolean", "label": "Está gestante ou amamentando?", "required": true},
      {"id": "problemas_saude", "type": "text", "label": "Problemas de saúde, pele ou circulatórios relevantes?", "required": false},
      {"id": "procedimentos_recentes", "type": "text", "label": "Fez procedimentos estéticos/químicos recentemente?", "required": false},
      {"id": "observacoes", "type": "text", "label": "Observações importantes", "required": false}
    ]
  }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_anamnesis_template(p_company_id uuid)
RETURNS public.anamnesis_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.anamnesis_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.anamnesis_templates
  WHERE company_id = p_company_id AND active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.anamnesis_templates (company_id, name, version, schema, active, validity_months)
  VALUES (p_company_id, 'Anamnese padrão', 1, public.anamnesis_default_schema(), true, 12)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_anamnesis_secret(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(trim(p_value), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.anamnesis_refresh_client_cache(p_company_id uuid, p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_months int;
  v_status text;
BEGIN
  SELECT s.submitted_at, COALESCE(t.validity_months, 12)
  INTO v_last, v_months
  FROM public.anamnesis_submissions s
  JOIN public.anamnesis_templates t ON t.id = s.template_id
  WHERE s.company_id = p_company_id
    AND s.client_id = p_client_id
    AND s.status IN ('submitted', 'reviewed')
  ORDER BY s.submitted_at DESC
  LIMIT 1;

  IF v_last IS NULL THEN
    v_status := 'missing';
  ELSIF v_last >= (now() - make_interval(months => v_months)) THEN
    v_status := 'valid';
  ELSE
    v_status := 'expired';
  END IF;

  UPDATE public.clients
  SET
    last_anamnesis_at = v_last,
    anamnesis_status = v_status,
    updated_at = now()
  WHERE id = p_client_id AND company_id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_anamnesis_is_valid(p_company_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_months int;
BEGIN
  SELECT s.submitted_at, COALESCE(t.validity_months, 12)
  INTO v_last, v_months
  FROM public.anamnesis_submissions s
  JOIN public.anamnesis_templates t ON t.id = s.template_id
  WHERE s.company_id = p_company_id
    AND s.client_id = p_client_id
    AND s.status IN ('submitted', 'reviewed')
  ORDER BY s.submitted_at DESC
  LIMIT 1;

  IF v_last IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_last >= (now() - make_interval(months => v_months));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_anamnesis_session(p_company_id uuid, p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.anamnesis_sessions (company_id, client_id, session_token_hash, expires_at)
  VALUES (
    p_company_id,
    p_client_id,
    public.hash_anamnesis_secret(v_raw),
    now() + interval '2 hours'
  );
  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_anamnesis_session(p_session_token text)
RETURNS TABLE (company_id uuid, client_id uuid, session_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.company_id, s.client_id, s.id
  FROM public.anamnesis_sessions s
  WHERE s.session_token_hash = public.hash_anamnesis_secret(p_session_token)
    AND s.expires_at > now()
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_whatsapp_anamnesis_otp(
  p_company_id uuid,
  p_client_id uuid,
  p_phone text,
  p_code text,
  p_studio_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_conn public.whatsapp_connections%ROWTYPE;
BEGIN
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RETURN NULL;
  END IF;
  IF NOT public.company_has_plan_feature(p_company_id, 'whatsapp') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_conn
  FROM public.whatsapp_connections
  WHERE company_id = p_company_id AND status = 'active';

  IF NOT FOUND OR v_conn.access_token_encrypted IS NULL OR length(trim(v_conn.access_token_encrypted)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.whatsapp_message_logs (
    company_id, client_id, phone, message_type, payload, status
  )
  VALUES (
    p_company_id,
    p_client_id,
    trim(p_phone),
    'anamnesis_otp',
    json_build_object(
      'body',
      format(
        'Seu código de anamnese %s: %s. Válido por 10 minutos. Não compartilhe.',
        COALESCE(p_studio_name, 'do salão'),
        p_code
      ),
      'code', p_code,
      'language', 'pt_BR'
    ),
    'pending'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Public / client RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_anamnesis_page_bootstrap(p_slug text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  b public.branding_settings%ROWTYPE;
  v_enabled boolean;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'slug_obrigatorio');
  END IF;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug);

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  v_enabled := public.company_has_plan_feature(comp.id, 'anamnesis');
  IF NOT v_enabled THEN
    RETURN json_build_object('ok', false, 'error', 'recurso_indisponivel');
  END IF;

  SELECT * INTO b FROM public.branding_settings WHERE company_id = comp.id;

  RETURN json_build_object(
    'ok', true,
    'company', json_build_object(
      'id', comp.id,
      'name', comp.name,
      'slug', comp.slug
    ),
    'branding', json_build_object(
      'brand_name', b.brand_name,
      'slogan', b.slogan,
      'logo_url', b.logo_url,
      'banner_url', b.banner_url,
      'primary_color', b.primary_color,
      'secondary_color', b.secondary_color,
      'whatsapp', b.whatsapp,
      'address', b.address,
      'public_hours_text', b.public_hours_text,
      'instagram_url', b.instagram_url
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_anamnesis_otp(p_slug text, p_whatsapp text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_phone text;
  v_client_id uuid;
  v_code text;
  v_log_id uuid;
  v_studio text;
  v_recent int;
BEGIN
  IF NOT (SELECT (public.get_anamnesis_page_bootstrap(p_slug)->>'ok')::boolean) THEN
    RETURN public.get_anamnesis_page_bootstrap(p_slug);
  END IF;

  SELECT * INTO comp FROM public.companies
  WHERE slug = public.normalize_booking_slug(p_slug);

  v_phone := public.norm_phone(p_whatsapp);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_invalido');
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE company_id = comp.id AND public.norm_phone(whatsapp) = v_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'cliente_nao_encontrado');
  END IF;

  SELECT count(*)::int INTO v_recent
  FROM public.anamnesis_otps
  WHERE company_id = comp.id
    AND phone_norm = v_phone
    AND created_at > now() - interval '15 minutes';

  IF v_recent >= 5 THEN
    RETURN json_build_object('ok', false, 'error', 'muitas_tentativas');
  END IF;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  UPDATE public.anamnesis_otps
  SET consumed_at = now()
  WHERE company_id = comp.id
    AND phone_norm = v_phone
    AND consumed_at IS NULL;

  INSERT INTO public.anamnesis_otps (company_id, client_id, phone_norm, code_hash, expires_at)
  VALUES (
    comp.id,
    v_client_id,
    v_phone,
    public.hash_anamnesis_secret(v_code),
    now() + interval '10 minutes'
  );

  SELECT COALESCE(NULLIF(trim(b.brand_name), ''), comp.name)
  INTO v_studio
  FROM public.branding_settings b
  WHERE b.company_id = comp.id;

  v_studio := COALESCE(v_studio, comp.name);
  v_log_id := public.queue_whatsapp_anamnesis_otp(comp.id, v_client_id, v_phone, v_code, v_studio);

  IF v_log_id IS NULL THEN
    -- Sem WhatsApp ativo: não devolve o código (segurança). Cliente deve usar link mágico ou senha.
    RETURN json_build_object(
      'ok', false,
      'error', 'whatsapp_indisponivel',
      'hint', 'WhatsApp oficial não está ativo neste salão. Use o link seguro enviado após o agendamento ou a senha, se já tiver criado.'
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'delivery', 'whatsapp',
    'expires_in_seconds', 600
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_anamnesis_otp(
  p_slug text,
  p_whatsapp text,
  p_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_phone text;
  v_otp public.anamnesis_otps%ROWTYPE;
  v_session text;
  v_has_password boolean;
BEGIN
  SELECT * INTO comp FROM public.companies
  WHERE slug = public.normalize_booking_slug(p_slug);
  IF NOT FOUND OR NOT public.company_has_plan_feature(comp.id, 'anamnesis') THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  v_phone := public.norm_phone(p_whatsapp);
  IF v_phone IS NULL OR p_code IS NULL OR length(trim(p_code)) < 4 THEN
    RETURN json_build_object('ok', false, 'error', 'codigo_invalido');
  END IF;

  SELECT * INTO v_otp
  FROM public.anamnesis_otps
  WHERE company_id = comp.id
    AND phone_norm = v_phone
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'codigo_expirado');
  END IF;

  IF v_otp.attempts >= 5 THEN
    RETURN json_build_object('ok', false, 'error', 'muitas_tentativas');
  END IF;

  IF v_otp.code_hash <> public.hash_anamnesis_secret(trim(p_code)) THEN
    UPDATE public.anamnesis_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    RETURN json_build_object('ok', false, 'error', 'codigo_invalido');
  END IF;

  UPDATE public.anamnesis_otps SET consumed_at = now() WHERE id = v_otp.id;
  v_session := public.create_anamnesis_session(comp.id, v_otp.client_id);

  SELECT EXISTS (
    SELECT 1 FROM public.client_credentials
    WHERE company_id = comp.id AND client_id = v_otp.client_id
  ) INTO v_has_password;

  RETURN json_build_object(
    'ok', true,
    'session_token', v_session,
    'has_password', v_has_password,
    'expires_in_seconds', 7200
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_anamnesis_access_token(p_slug text, p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_tok public.anamnesis_access_tokens%ROWTYPE;
  v_session text;
  v_has_password boolean;
BEGIN
  SELECT * INTO comp FROM public.companies
  WHERE slug = public.normalize_booking_slug(p_slug);
  IF NOT FOUND OR NOT public.company_has_plan_feature(comp.id, 'anamnesis') THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 20 THEN
    RETURN json_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  SELECT * INTO v_tok
  FROM public.anamnesis_access_tokens
  WHERE company_id = comp.id
    AND token_hash = public.hash_anamnesis_secret(trim(p_token))
    AND consumed_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  UPDATE public.anamnesis_access_tokens SET consumed_at = now() WHERE id = v_tok.id;
  v_session := public.create_anamnesis_session(comp.id, v_tok.client_id);

  SELECT EXISTS (
    SELECT 1 FROM public.client_credentials
    WHERE company_id = comp.id AND client_id = v_tok.client_id
  ) INTO v_has_password;

  RETURN json_build_object(
    'ok', true,
    'session_token', v_session,
    'has_password', v_has_password,
    'expires_in_seconds', 7200
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.login_anamnesis_password(
  p_slug text,
  p_whatsapp text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_phone text;
  v_client_id uuid;
  v_hash text;
  v_session text;
BEGIN
  SELECT * INTO comp FROM public.companies
  WHERE slug = public.normalize_booking_slug(p_slug);
  IF NOT FOUND OR NOT public.company_has_plan_feature(comp.id, 'anamnesis') THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  v_phone := public.norm_phone(p_whatsapp);
  IF v_phone IS NULL OR p_password IS NULL OR length(trim(p_password)) < 6 THEN
    RETURN json_build_object('ok', false, 'error', 'credenciais_invalidas');
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE company_id = comp.id AND public.norm_phone(whatsapp) = v_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'cliente_nao_encontrado');
  END IF;

  SELECT password_hash INTO v_hash
  FROM public.client_credentials
  WHERE company_id = comp.id AND client_id = v_client_id;

  IF v_hash IS NULL OR v_hash <> extensions.crypt(trim(p_password), v_hash) THEN
    RETURN json_build_object('ok', false, 'error', 'credenciais_invalidas');
  END IF;

  v_session := public.create_anamnesis_session(comp.id, v_client_id);
  RETURN json_build_object(
    'ok', true,
    'session_token', v_session,
    'has_password', true,
    'expires_in_seconds', 7200
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_anamnesis_password(
  p_session_token text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
BEGIN
  SELECT r.company_id, r.client_id INTO v_company_id, v_client_id
  FROM public.resolve_anamnesis_session(p_session_token) r;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'sessao_invalida');
  END IF;

  IF p_password IS NULL OR length(trim(p_password)) < 6 THEN
    RETURN json_build_object('ok', false, 'error', 'senha_fraca');
  END IF;

  INSERT INTO public.client_credentials (company_id, client_id, password_hash)
  VALUES (v_company_id, v_client_id, extensions.crypt(trim(p_password), extensions.gen_salt('bf')))
  ON CONFLICT (company_id, client_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_anamnesis_form(p_session_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
  comp public.companies%ROWTYPE;
  b public.branding_settings%ROWTYPE;
  tpl public.anamnesis_templates%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_valid boolean;
  v_has_password boolean;
BEGIN
  SELECT r.company_id, r.client_id INTO v_company_id, v_client_id
  FROM public.resolve_anamnesis_session(p_session_token) r;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'sessao_invalida');
  END IF;

  SELECT * INTO comp FROM public.companies WHERE id = v_company_id;
  SELECT * INTO b FROM public.branding_settings WHERE company_id = v_company_id;
  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id;
  tpl := public.ensure_default_anamnesis_template(v_company_id);
  v_valid := public.client_anamnesis_is_valid(v_company_id, v_client_id);

  SELECT EXISTS (
    SELECT 1 FROM public.client_credentials
    WHERE company_id = v_company_id AND client_id = v_client_id
  ) INTO v_has_password;

  RETURN json_build_object(
    'ok', true,
    'company', json_build_object('name', comp.name, 'slug', comp.slug),
    'branding', json_build_object(
      'brand_name', b.brand_name,
      'slogan', b.slogan,
      'logo_url', b.logo_url,
      'banner_url', b.banner_url,
      'primary_color', b.primary_color,
      'secondary_color', b.secondary_color,
      'whatsapp', b.whatsapp,
      'address', b.address
    ),
    'client', json_build_object(
      'name', v_client.name,
      'whatsapp', v_client.whatsapp,
      'anamnesis_status', v_client.anamnesis_status,
      'last_anamnesis_at', v_client.last_anamnesis_at
    ),
    'template', json_build_object(
      'id', tpl.id,
      'name', tpl.name,
      'version', tpl.version,
      'schema', tpl.schema,
      'validity_months', tpl.validity_months
    ),
    'anamnesis_valid', v_valid,
    'has_password', v_has_password
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_anamnesis(
  p_session_token text,
  p_answers jsonb,
  p_consent boolean DEFAULT true,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
  tpl public.anamnesis_templates%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT r.company_id, r.client_id INTO v_company_id, v_client_id
  FROM public.resolve_anamnesis_session(p_session_token) r;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'sessao_invalida');
  END IF;

  IF COALESCE(p_consent, false) IS NOT TRUE THEN
    RETURN json_build_object('ok', false, 'error', 'consentimento_obrigatorio');
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RETURN json_build_object('ok', false, 'error', 'respostas_invalidas');
  END IF;

  tpl := public.ensure_default_anamnesis_template(v_company_id);

  INSERT INTO public.anamnesis_submissions (
    company_id, client_id, template_id, template_version,
    appointment_id, answers, filled_by, status, consent_at, submitted_at
  )
  VALUES (
    v_company_id, v_client_id, tpl.id, tpl.version,
    p_appointment_id, p_answers, 'client', 'submitted', now(), now()
  )
  RETURNING id INTO v_id;

  PERFORM public.anamnesis_refresh_client_cache(v_company_id, v_client_id);

  RETURN json_build_object('ok', true, 'submission_id', v_id);
END;
$$;

-- Após agendamento: gera link se algum serviço exigir e ficha não estiver válida
CREATE OR REPLACE FUNCTION public.prepare_anamnesis_after_booking(
  p_slug text,
  p_appointment_id uuid,
  p_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_phone text;
  v_client_id uuid;
  v_appt public.appointments%ROWTYPE;
  v_needs boolean := false;
  v_raw text;
  v_token_hash text;
BEGIN
  SELECT * INTO comp FROM public.companies
  WHERE slug = public.normalize_booking_slug(p_slug);
  IF NOT FOUND OR NOT public.company_has_plan_feature(comp.id, 'anamnesis') THEN
    RETURN json_build_object('ok', true, 'required', false);
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id AND company_id = comp.id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  v_phone := public.norm_phone(p_whatsapp);
  v_client_id := v_appt.client_id;

  IF v_phone IS NOT NULL THEN
    -- Confere telefone do cliente do appointment
    IF public.norm_phone((SELECT whatsapp FROM public.clients WHERE id = v_client_id)) IS DISTINCT FROM v_phone THEN
      RETURN json_build_object('ok', false, 'error', 'whatsapp_nao_confere');
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.company_id = comp.id
      AND a.client_id = v_client_id
      AND a.appointment_date = v_appt.appointment_date
      AND a.appointment_time = v_appt.appointment_time
      AND a.status <> 'cancelled'
      AND COALESCE(s.require_anamnesis, false) = true
  ) INTO v_needs;

  IF NOT v_needs THEN
    RETURN json_build_object('ok', true, 'required', false);
  END IF;

  IF public.client_anamnesis_is_valid(comp.id, v_client_id) THEN
    RETURN json_build_object('ok', true, 'required', false, 'already_valid', true);
  END IF;

  v_raw := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := public.hash_anamnesis_secret(v_raw);

  INSERT INTO public.anamnesis_access_tokens (
    company_id, client_id, token_hash, appointment_id, expires_at
  )
  VALUES (comp.id, v_client_id, v_token_hash, p_appointment_id, now() + interval '72 hours');

  RETURN json_build_object(
    'ok', true,
    'required', true,
    'access_token', v_raw,
    'expires_in_hours', 72
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_client_anamnesis(
  p_company_id uuid,
  p_client_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items json;
BEGIN
  IF NOT public.user_can_read_client(p_company_id, p_client_id) THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;
  IF NOT public.company_has_plan_feature(p_company_id, 'anamnesis') THEN
    RETURN json_build_object('ok', false, 'error', 'recurso_indisponivel');
  END IF;

  SELECT COALESCE(json_agg(obj ORDER BY (obj->>'submitted_at') DESC), '[]'::json)
  INTO v_items
  FROM (
    SELECT json_build_object(
      'id', s.id,
      'template_name', t.name,
      'template_version', s.template_version,
      'answers', s.answers,
      'filled_by', s.filled_by,
      'status', s.status,
      'submitted_at', s.submitted_at,
      'consent_at', s.consent_at
    ) AS obj
    FROM public.anamnesis_submissions s
    JOIN public.anamnesis_templates t ON t.id = s.template_id
    WHERE s.company_id = p_company_id AND s.client_id = p_client_id
    ORDER BY s.submitted_at DESC
    LIMIT 50
  ) q;

  RETURN json_build_object(
    'ok', true,
    'items', v_items,
    'is_valid', public.client_anamnesis_is_valid(p_company_id, p_client_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_submit_anamnesis(
  p_company_id uuid,
  p_client_id uuid,
  p_answers jsonb,
  p_consent boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tpl public.anamnesis_templates%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.user_can_update_client(p_company_id, p_client_id) THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;
  IF NOT public.company_has_plan_feature(p_company_id, 'anamnesis') THEN
    RETURN json_build_object('ok', false, 'error', 'recurso_indisponivel');
  END IF;
  IF COALESCE(p_consent, false) IS NOT TRUE THEN
    RETURN json_build_object('ok', false, 'error', 'consentimento_obrigatorio');
  END IF;

  tpl := public.ensure_default_anamnesis_template(p_company_id);

  INSERT INTO public.anamnesis_submissions (
    company_id, client_id, template_id, template_version,
    answers, filled_by, status, consent_at, submitted_at, created_by_user_id
  )
  VALUES (
    p_company_id, p_client_id, tpl.id, tpl.version,
    COALESCE(p_answers, '{}'::jsonb), 'staff', 'submitted', now(), now(), auth.uid()
  )
  RETURNING id INTO v_id;

  PERFORM public.anamnesis_refresh_client_cache(p_company_id, p_client_id);
  RETURN json_build_object('ok', true, 'submission_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_create_anamnesis_link(
  p_company_id uuid,
  p_client_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_slug text;
BEGIN
  IF NOT public.user_can_update_client(p_company_id, p_client_id) THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;
  IF NOT public.company_has_plan_feature(p_company_id, 'anamnesis') THEN
    RETURN json_build_object('ok', false, 'error', 'recurso_indisponivel');
  END IF;

  SELECT slug INTO v_slug FROM public.companies WHERE id = p_company_id;
  v_raw := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.anamnesis_access_tokens (company_id, client_id, token_hash, expires_at)
  VALUES (p_company_id, p_client_id, public.hash_anamnesis_secret(v_raw), now() + interval '72 hours');

  RETURN json_build_object(
    'ok', true,
    'access_token', v_raw,
    'slug', v_slug,
    'expires_in_hours', 72
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_appointment_anamnesis_flags(
  p_company_id uuid,
  p_appointment_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items json;
BEGIN
  IF NOT public.user_can_access_company_panel(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;
  IF NOT public.company_has_plan_feature(p_company_id, 'anamnesis') THEN
    RETURN json_build_object('ok', true, 'items', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(obj), '[]'::json)
  INTO v_items
  FROM (
    SELECT json_build_object(
      'appointment_id', a.id,
      'client_id', a.client_id,
      'service_requires', COALESCE(s.require_anamnesis, false),
      'client_status', c.anamnesis_status,
      'is_valid', public.client_anamnesis_is_valid(p_company_id, a.client_id)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    JOIN public.clients c ON c.id = a.client_id
    WHERE a.company_id = p_company_id
      AND a.id = ANY (p_appointment_ids)
  ) q;

  RETURN json_build_object('ok', true, 'items', v_items);
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.get_anamnesis_page_bootstrap(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_anamnesis_otp(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_anamnesis_otp(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_anamnesis_access_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_anamnesis_password(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_anamnesis_password(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_anamnesis_form(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_anamnesis(text, jsonb, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_anamnesis_after_booking(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_client_anamnesis(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_submit_anamnesis(uuid, uuid, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_create_anamnesis_link(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_appointment_anamnesis_flags(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_anamnesis_page_bootstrap(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_anamnesis_otp(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_anamnesis_otp(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_anamnesis_access_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_anamnesis_password(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_anamnesis_password(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_form(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_anamnesis(text, jsonb, boolean, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_anamnesis_after_booking(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_client_anamnesis(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_submit_anamnesis(uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_create_anamnesis_link(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_anamnesis_flags(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
