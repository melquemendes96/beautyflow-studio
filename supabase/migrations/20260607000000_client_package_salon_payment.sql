-- Pacotes: pagamento no salão, prestador fixo, confirmação admin/prestador

ALTER TABLE public.client_packages
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_packages_pending_payment
  ON public.client_packages (company_id, status)
  WHERE status = 'pending_payment';

UPDATE public.client_packages SET status = 'pending_payment' WHERE status = 'pending';

ALTER TABLE public.client_packages DROP CONSTRAINT IF EXISTS client_packages_status_check;
ALTER TABLE public.client_packages
  ADD CONSTRAINT client_packages_status_check
  CHECK (status IN ('pending_payment', 'active', 'completed', 'cancelled'));

-- ---------------------------------------------------------------------------
-- Permissão: admin confirma todos; prestador só o pacote dele
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_confirm_client_package(
  p_company_id uuid,
  p_package_provider_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR (
      p_package_provider_id IS NOT NULL
      AND public.current_user_provider_id_for_company(p_company_id) = p_package_provider_id
    );
$$;

-- ---------------------------------------------------------------------------
-- lookup_client_package — pacote ativo (renovação de sessão)
-- ---------------------------------------------------------------------------
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
  v_pending public.client_packages%ROWTYPE;
  v_holidays json;
  v_is_last boolean;
  v_provider public.service_providers%ROWTYPE;
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

  SELECT * INTO v_pending
  FROM public.client_packages cp
  WHERE cp.company_id = comp.id
    AND cp.client_id = v_client_id
    AND cp.service_id = p_service_id
    AND cp.status = 'pending_payment'
  ORDER BY cp.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'ok', true,
      'found', false,
      'error', 'aguardando_pagamento_salao',
      'pending_payment', true,
      'client_package_id', v_pending.id
    );
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

  IF v_pkg.provider_id IS NOT NULL THEN
    SELECT * INTO v_provider FROM public.service_providers sp WHERE sp.id = v_pkg.provider_id;
  END IF;

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
    'expires_at', v_pkg.expires_at,
    'provider_id', v_pkg.provider_id,
    'provider_name', v_provider.display_name,
    'provider_photo_url', v_provider.photo_url,
    'provider_color', v_provider.color
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- create_public_booking — pacote: 1ª compra (pending) ou sessão (active)
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
  v_new_pkg_id uuid;
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
  v_effective_provider_id uuid;
  v_pending_payment boolean := false;
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
  v_effective_provider_id := p_provider_id;

  IF v_team THEN
    SELECT count(*)::int INTO v_provider_count
    FROM public.service_providers sp
    JOIN public.provider_services ps ON ps.provider_id = sp.id
    WHERE sp.company_id = comp.id AND sp.active = true AND ps.service_id = p_service_id;

    IF v_provider_count > 0 AND v_effective_provider_id IS NULL AND svc.service_kind <> 'package' THEN
      RETURN json_build_object('ok', false, 'error', 'prestador_obrigatorio');
    END IF;

    IF v_effective_provider_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.service_providers sp
      JOIN public.provider_services ps ON ps.provider_id = sp.id
      WHERE sp.id = v_effective_provider_id AND sp.company_id = comp.id AND sp.active = true
        AND ps.service_id = p_service_id
    ) THEN
      RETURN json_build_object('ok', false, 'error', 'prestador_invalido');
    END IF;
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

  IF svc.service_kind = 'package' THEN
    IF p_client_package_id IS NULL THEN
      -- Primeira contratação: prestador obrigatório se equipe
      IF v_team AND v_provider_count > 0 AND v_effective_provider_id IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'prestador_obrigatorio');
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.client_packages cp
        WHERE cp.company_id = comp.id AND cp.client_id = v_client_id AND cp.service_id = p_service_id
          AND cp.status IN ('pending_payment', 'active')
      ) THEN
        RETURN json_build_object('ok', false, 'error', 'pacote_ja_existe');
      END IF;

      IF COALESCE(svc.package_sessions, 0) <= 0 THEN
        RETURN json_build_object('ok', false, 'error', 'pacote_sem_sessoes');
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

      INSERT INTO public.client_packages (
        company_id, client_id, service_id, total_sessions, used_sessions,
        status, provider_id, expires_at, notes
      )
      VALUES (
        comp.id, v_client_id, p_service_id, svc.package_sessions, 0,
        'pending_payment', v_effective_provider_id,
        CASE WHEN svc.package_valid_days IS NOT NULL
          THEN (current_date + svc.package_valid_days) ELSE NULL END,
        p_notes
      )
      RETURNING id INTO v_new_pkg_id;

      v_pkg.id := v_new_pkg_id;
      v_pkg.total_sessions := svc.package_sessions;
      v_session_num := NULL;
      v_pending_payment := true;
      p_client_package_id := v_new_pkg_id;
    ELSE
      SELECT * INTO v_pkg
      FROM public.client_packages cp
      WHERE cp.id = p_client_package_id AND cp.company_id = comp.id AND cp.service_id = p_service_id;

      IF NOT FOUND OR v_pkg.status <> 'active' OR v_pkg.used_sessions >= v_pkg.total_sessions THEN
        RETURN json_build_object('ok', false, 'error', 'pacote_invalido');
      END IF;

      IF v_pkg.client_id <> v_client_id THEN
        RETURN json_build_object('ok', false, 'error', 'pacote_cliente_divergente');
      END IF;

      IF v_pkg.provider_id IS NOT NULL THEN
        v_effective_provider_id := v_pkg.provider_id;
      END IF;

      IF v_effective_provider_id IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'prestador_obrigatorio');
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
  END IF;

  v_slot := to_char(v_time, 'HH24:MI');
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements_text(
      public.get_available_slots(public.normalize_booking_slug(p_slug), p_service_id, p_appointment_date, v_effective_provider_id)::json
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
      AND (
        v_effective_provider_id IS NULL
        OR a.provider_id IS NOT DISTINCT FROM v_effective_provider_id
      )
      AND v_start < (p_appointment_date::timestamp + a.appointment_time)
        + make_interval(mins => (COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0)))
      AND v_end > (p_appointment_date::timestamp + a.appointment_time)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  INSERT INTO public.appointments (
    company_id, client_id, service_id, appointment_date, appointment_time, status,
    provider_id, client_package_id, package_session_number
  )
  VALUES (
    comp.id, v_client_id, p_service_id, p_appointment_date, v_time, 'scheduled',
    v_effective_provider_id, p_client_package_id, v_session_num
  )
  RETURNING id INTO v_appt_id;

  IF svc.service_kind = 'package' AND p_client_package_id IS NOT NULL AND NOT v_pending_payment THEN
    UPDATE public.client_packages SET
      used_sessions = used_sessions + 1,
      status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'completed' ELSE status END,
      updated_at = now()
    WHERE id = p_client_package_id;
  END IF;

  IF COALESCE(p_whatsapp_notifications, false) AND v_phone IS NOT NULL AND NOT v_pending_payment THEN
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
    'client_package_id', p_client_package_id,
    'company_id', comp.id,
    'appointment_date', p_appointment_date,
    'appointment_time', v_slot,
    'pending_payment', v_pending_payment,
    'package_session_number', v_session_num,
    'package_total_sessions', COALESCE(v_pkg.total_sessions, svc.package_sessions),
    'is_last_package_session', (v_session_num IS NOT NULL AND v_session_num = v_pkg.total_sessions),
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

-- ---------------------------------------------------------------------------
-- Confirmar pagamento do pacote no salão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_client_package_payment(p_company_id uuid, p_client_package_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_pkg public.client_packages%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_client_package_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO v_pkg
  FROM public.client_packages cp
  WHERE cp.id = p_client_package_id AND cp.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_nao_encontrado');
  END IF;

  IF v_pkg.status <> 'pending_payment' THEN
    RETURN json_build_object('ok', false, 'error', 'status_invalido');
  END IF;

  IF NOT public.user_can_confirm_client_package(p_company_id, v_pkg.provider_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.client_packages SET
    status = 'active',
    used_sessions = 1,
    paid_at = now(),
    payment_confirmed_at = now(),
    payment_confirmed_by = auth.uid(),
    updated_at = now()
  WHERE id = v_pkg.id;

  SELECT * INTO v_appt
  FROM public.appointments a
  WHERE a.client_package_id = v_pkg.id AND a.status <> 'cancelled'
  ORDER BY a.appointment_date, a.appointment_time
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.appointments SET
      package_session_number = 1
    WHERE id = v_appt.id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'client_package_id', v_pkg.id,
    'used_sessions', 1,
    'total_sessions', v_pkg.total_sessions
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Converter pacote pendente em atendimento avulso (pagou só 1 sessão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_client_package_to_single(p_company_id uuid, p_client_package_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_pkg public.client_packages%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_client_package_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO v_pkg
  FROM public.client_packages cp
  WHERE cp.id = p_client_package_id AND cp.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_nao_encontrado');
  END IF;

  IF v_pkg.status <> 'pending_payment' THEN
    RETURN json_build_object('ok', false, 'error', 'status_invalido');
  END IF;

  IF NOT public.user_can_confirm_client_package(p_company_id, v_pkg.provider_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.appointments SET
    client_package_id = NULL,
    package_session_number = NULL
  WHERE client_package_id = v_pkg.id;

  UPDATE public.client_packages SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = v_pkg.id;

  RETURN json_build_object('ok', true, 'client_package_id', v_pkg.id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Listar pacotes aguardando pagamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pending_client_packages(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_provider_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'company_id_required');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_provider_id := public.current_user_provider_id_for_company(p_company_id);

  RETURN json_build_object(
    'ok', true,
    'packages', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.appointment_date, x.appointment_time)
      FROM (
        SELECT
          cp.id,
          cp.client_id,
          c.name AS client_name,
          c.whatsapp AS client_whatsapp,
          cp.service_id,
          s.name AS service_name,
          s.price AS service_price,
          cp.total_sessions,
          cp.provider_id,
          sp.display_name AS provider_name,
          sp.color AS provider_color,
          a.id AS appointment_id,
          a.appointment_date,
          to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
          cp.created_at
        FROM public.client_packages cp
        JOIN public.clients c ON c.id = cp.client_id
        JOIN public.services s ON s.id = cp.service_id
        LEFT JOIN public.service_providers sp ON sp.id = cp.provider_id
        LEFT JOIN LATERAL (
          SELECT ap.*
          FROM public.appointments ap
          WHERE ap.client_package_id = cp.id AND ap.status <> 'cancelled'
          ORDER BY ap.appointment_date, ap.appointment_time
          LIMIT 1
        ) a ON true
        WHERE cp.company_id = p_company_id
          AND cp.status = 'pending_payment'
          AND (
            public.is_platform_admin()
            OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
            OR (
              v_provider_id IS NOT NULL
              AND cp.provider_id = v_provider_id
            )
          )
      ) x
    ), '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_client_package_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_client_package_to_single(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_client_packages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_package(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(
  text, uuid, date, time, text, text, text, text, boolean, uuid, uuid
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
