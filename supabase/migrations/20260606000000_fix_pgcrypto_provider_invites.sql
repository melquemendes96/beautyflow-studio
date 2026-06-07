-- Convite de prestador: gen_random_bytes/digest exigem pgcrypto (schema extensions no Supabase)

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hash_provider_invite_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.admin_create_provider_invite(
  p_company_id uuid,
  p_provider_id uuid,
  p_expected_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
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

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
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

NOTIFY pgrst, 'reload schema';
