-- Fase B: convite de prestador + agenda individual + painel restrito
-- Depende de: 20260601000000_team_packages_foundation.sql

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'company_user_role' AND e.enumlabel = 'provider'
  ) THEN
    ALTER TYPE public.company_user_role ADD VALUE 'provider';
  END IF;
END $$;

ALTER TABLE public.company_users
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_users_provider_id
  ON public.company_users (provider_id)
  WHERE provider_id IS NOT NULL;

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'no_access',
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

ALTER TABLE public.service_providers DROP CONSTRAINT IF EXISTS service_providers_access_status_check;
ALTER TABLE public.service_providers
  ADD CONSTRAINT service_providers_access_status_check
  CHECK (access_status IN ('no_access', 'invite_pending', 'active', 'suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_providers_user_id
  ON public.service_providers (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.provider_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expected_email text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_invites_provider ON public.provider_invites (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_invites_token_hash ON public.provider_invites (token_hash) WHERE revoked_at IS NULL AND used_at IS NULL;

ALTER TABLE public.provider_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_invites_owner_admin ON public.provider_invites;
CREATE POLICY provider_invites_owner_admin ON public.provider_invites
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_provider_invite_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(trim(p_token), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.current_user_provider_id_for_company(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT cu.provider_id
  FROM public.company_users cu
  WHERE cu.user_id = auth.uid()
    AND cu.company_id = p_company_id
    AND cu.role = 'provider'::public.company_user_role
    AND cu.provider_id IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_company_appointment(p_company_id uuid, p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      p_company_id IN (SELECT public.current_user_company_ids())
      AND (
        public.current_user_provider_id_for_company(p_company_id) IS NULL
        OR p_provider_id = public.current_user_provider_id_for_company(p_company_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.revoke_provider_panel_access(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.provider_invites pi
  SET revoked_at = now()
  WHERE pi.provider_id = p_provider_id
    AND pi.revoked_at IS NULL
    AND pi.used_at IS NULL;

  DELETE FROM public.company_users cu
  WHERE cu.provider_id = p_provider_id;

  UPDATE public.service_providers sp
  SET
    user_id = NULL,
    access_status = CASE
      WHEN sp.access_status = 'suspended' THEN 'suspended'
      ELSE 'no_access'
    END,
    linked_at = NULL
  WHERE sp.id = p_provider_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_auth_panel_context: incluir provider_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_panel_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_memberships jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'is_platform_admin', false,
      'company_memberships', '[]'::jsonb
    );
  END IF;

  v_is_admin := public.is_platform_admin();

  IF v_is_admin THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (v_uid)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'company_id', cu.company_id,
        'role', cu.role,
        'provider_id', cu.provider_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_memberships
  FROM public.company_users cu
  WHERE cu.user_id = v_uid;

  RETURN jsonb_build_object(
    'is_platform_admin', v_is_admin,
    'company_memberships', v_memberships
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_panel_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_panel_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_panel_context() TO anon;

-- ---------------------------------------------------------------------------
-- RLS: appointments filtrados por prestador
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS appointments_all ON public.appointments;
CREATE POLICY appointments_all
  ON public.appointments FOR ALL TO authenticated
  USING (
    public.user_can_access_company_appointment(company_id, provider_id)
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      company_id IN (SELECT public.current_user_company_ids())
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
        OR provider_id IS NULL
      )
    )
  );

-- ---------------------------------------------------------------------------
-- admin_list_service_providers: campos de acesso
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_service_providers(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
          sp.user_id,
          sp.access_status,
          sp.invited_email,
          sp.invited_at,
          sp.linked_at,
          (
            SELECT lower(trim(u.email))
            FROM auth.users u
            WHERE u.id = sp.user_id
          ) AS linked_user_email,
          (
            SELECT pi.expires_at
            FROM public.provider_invites pi
            WHERE pi.provider_id = sp.id
              AND pi.revoked_at IS NULL
              AND pi.used_at IS NULL
              AND pi.expires_at > now()
            ORDER BY pi.created_at DESC
            LIMIT 1
          ) AS invite_expires_at,
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

-- ---------------------------------------------------------------------------
-- admin_delete: revoga acesso antes de apagar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_service_provider(p_company_id uuid, p_provider_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = p_provider_id AND sp.company_id = p_company_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
  END IF;

  PERFORM public.revoke_provider_panel_access(p_provider_id);

  DELETE FROM public.service_providers sp
  WHERE sp.id = p_provider_id AND sp.company_id = p_company_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Convites (admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_provider_invite(
  p_company_id uuid,
  p_provider_id uuid,
  p_expected_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_token text;
  v_email text;
  v_expires timestamptz;
  v_provider public.service_providers%ROWTYPE;
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  SELECT * INTO v_provider
  FROM public.service_providers sp
  WHERE sp.id = p_provider_id AND sp.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
  END IF;

  IF v_provider.access_status = 'active' AND v_provider.user_id IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_ja_vinculado');
  END IF;

  v_email := nullif(lower(trim(p_expected_email)), '');
  IF v_email IS NOT NULL AND v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RETURN json_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  UPDATE public.provider_invites pi
  SET revoked_at = now()
  WHERE pi.provider_id = p_provider_id
    AND pi.revoked_at IS NULL
    AND pi.used_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '7 days';

  INSERT INTO public.provider_invites (
    company_id, provider_id, token_hash, expected_email, expires_at, created_by
  )
  VALUES (
    p_company_id,
    p_provider_id,
    public.hash_provider_invite_token(v_token),
    v_email,
    v_expires,
    auth.uid()
  );

  UPDATE public.service_providers sp
  SET
    access_status = 'invite_pending',
    invited_email = COALESCE(v_email, sp.invited_email),
    invited_at = now()
  WHERE sp.id = p_provider_id;

  RETURN json_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_provider_invite(p_company_id uuid, p_provider_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  UPDATE public.provider_invites pi
  SET revoked_at = now()
  WHERE pi.provider_id = p_provider_id
    AND pi.company_id = p_company_id
    AND pi.revoked_at IS NULL
    AND pi.used_at IS NULL;

  UPDATE public.service_providers sp
  SET access_status = 'no_access'
  WHERE sp.id = p_provider_id
    AND sp.company_id = p_company_id
    AND sp.access_status = 'invite_pending'
    AND sp.user_id IS NULL;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_suspend_provider_access(p_company_id uuid, p_provider_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = p_provider_id AND sp.company_id = p_company_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
  END IF;

  PERFORM public.revoke_provider_panel_access(p_provider_id);

  UPDATE public.service_providers sp
  SET access_status = 'suspended', active = false
  WHERE sp.id = p_provider_id AND sp.company_id = p_company_id;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_provider_access(p_company_id uuid, p_provider_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  UPDATE public.service_providers sp
  SET active = true, access_status = 'no_access'
  WHERE sp.id = p_provider_id
    AND sp.company_id = p_company_id
    AND sp.access_status = 'suspended';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_suspenso');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlink_provider_user(p_company_id uuid, p_provider_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_team_admin_for_company(p_company_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = p_provider_id AND sp.company_id = p_company_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
  END IF;

  PERFORM public.revoke_provider_panel_access(p_provider_id);

  UPDATE public.service_providers sp
  SET access_status = 'no_access', active = sp.active
  WHERE sp.id = p_provider_id AND sp.company_id = p_company_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Convites (público + aceite)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_provider_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_invite public.provider_invites%ROWTYPE;
  v_provider public.service_providers%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_branding public.branding_settings%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN json_build_object('ok', false, 'error', 'convite_invalido');
  END IF;

  SELECT * INTO v_invite
  FROM public.provider_invites pi
  WHERE pi.token_hash = public.hash_provider_invite_token(p_token)
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'convite_invalido');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'convite_revogado');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'convite_ja_usado');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN json_build_object('ok', false, 'error', 'convite_expirado');
  END IF;

  SELECT * INTO v_provider
  FROM public.service_providers sp
  WHERE sp.id = v_invite.provider_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_removido');
  END IF;

  IF v_provider.access_status = 'suspended' THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_suspenso');
  END IF;

  IF v_provider.user_id IS NOT NULL AND v_provider.access_status = 'active' THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_ja_vinculado');
  END IF;

  SELECT * INTO v_company
  FROM public.companies c
  WHERE c.id = v_invite.company_id AND c.status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_inativa');
  END IF;

  SELECT * INTO v_branding
  FROM public.branding_settings b
  WHERE b.company_id = v_company.id;

  RETURN json_build_object(
    'ok', true,
    'provider_name', v_provider.display_name,
    'provider_photo_url', v_provider.photo_url,
    'company_name', v_company.name,
    'company_logo_url', v_branding.logo_url,
    'expected_email', v_invite.expected_email,
    'expires_at', v_invite.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_provider_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.provider_invites%ROWTYPE;
  v_provider public.service_providers%ROWTYPE;
  v_user_email text;
  v_existing_role public.company_user_role;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'nao_autenticado');
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN json_build_object('ok', false, 'error', 'convite_invalido');
  END IF;

  SELECT * INTO v_invite
  FROM public.provider_invites pi
  WHERE pi.token_hash = public.hash_provider_invite_token(p_token)
  ORDER BY pi.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'convite_invalido');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'convite_revogado');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'convite_ja_usado');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN json_build_object('ok', false, 'error', 'convite_expirado');
  END IF;

  SELECT * INTO v_provider
  FROM public.service_providers sp
  WHERE sp.id = v_invite.provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_removido');
  END IF;

  IF v_provider.access_status = 'suspended' THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_suspenso');
  END IF;

  IF v_provider.user_id IS NOT NULL AND v_provider.access_status = 'active' THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_ja_vinculado');
  END IF;

  SELECT lower(trim(u.email)) INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_invite.expected_email IS NOT NULL
     AND v_user_email IS DISTINCT FROM lower(trim(v_invite.expected_email)) THEN
    RETURN json_build_object('ok', false, 'error', 'email_nao_confere');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.user_id = v_uid AND sp.id <> v_provider.id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'usuario_ja_prestador');
  END IF;

  SELECT cu.role INTO v_existing_role
  FROM public.company_users cu
  WHERE cu.company_id = v_invite.company_id AND cu.user_id = v_uid
  LIMIT 1;

  IF v_existing_role IN ('owner', 'admin') THEN
    RETURN json_build_object('ok', false, 'error', 'conta_administradora');
  END IF;

  DELETE FROM public.company_users cu
  WHERE cu.company_id = v_invite.company_id AND cu.user_id = v_uid;

  INSERT INTO public.company_users (company_id, user_id, role, provider_id)
  VALUES (v_invite.company_id, v_uid, 'provider'::public.company_user_role, v_provider.id);

  UPDATE public.service_providers sp
  SET
    user_id = v_uid,
    access_status = 'active',
    linked_at = now(),
    invited_email = COALESCE(v_invite.expected_email, sp.invited_email)
  WHERE sp.id = v_provider.id;

  UPDATE public.provider_invites pi
  SET used_at = now(), used_by_user_id = v_uid
  WHERE pi.id = v_invite.id;

  UPDATE public.provider_invites pi
  SET revoked_at = now()
  WHERE pi.provider_id = v_provider.id
    AND pi.id <> v_invite.id
    AND pi.revoked_at IS NULL
    AND pi.used_at IS NULL;

  RETURN json_build_object(
    'ok', true,
    'company_id', v_invite.company_id,
    'provider_id', v_provider.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_provider_invite(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_provider_invite(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_provider_invite(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_provider_invite(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_suspend_provider_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_suspend_provider_access(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_reactivate_provider_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_provider_access(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_unlink_provider_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unlink_provider_user(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.preview_provider_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_provider_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_provider_invite(text) TO anon;
REVOKE ALL ON FUNCTION public.accept_provider_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_provider_invite(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
