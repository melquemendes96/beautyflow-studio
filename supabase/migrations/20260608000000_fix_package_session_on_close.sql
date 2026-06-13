-- Fase 0: sessão de pacote consumida ao concluir atendimento (não no agendamento).
-- confirm_client_package_payment só ativa o pacote; consume_client_package_session incrementa used_sessions.

-- ---------------------------------------------------------------------------
-- consume_client_package_session — idempotente; chamar ao Concluir (ponte até comanda)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_client_package_session(p_appointment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_pkg public.client_packages%ROWTYPE;
  v_new_used int;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF NOT public.user_can_access_company_appointment(v_appt.company_id, v_appt.provider_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_appt.client_package_id IS NULL THEN
    RETURN json_build_object('ok', true, 'consumed', false, 'reason', 'sem_pacote');
  END IF;

  IF v_appt.package_session_number IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    RETURN json_build_object(
      'ok', true,
      'consumed', false,
      'already_consumed', true,
      'used_sessions', v_pkg.used_sessions,
      'total_sessions', v_pkg.total_sessions,
      'remaining', GREATEST(v_pkg.total_sessions - v_pkg.used_sessions, 0),
      'session_label', v_appt.package_session_number::text || '/' || v_pkg.total_sessions::text
    );
  END IF;

  IF v_appt.status NOT IN ('scheduled', 'confirmed', 'completed') THEN
    RETURN json_build_object('ok', false, 'error', 'status_invalido');
  END IF;

  SELECT * INTO v_pkg
  FROM public.client_packages cp
  WHERE cp.id = v_appt.client_package_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_nao_encontrado');
  END IF;

  IF v_pkg.status = 'pending_payment' THEN
    RETURN json_build_object('ok', false, 'error', 'aguardando_pagamento_salao');
  END IF;

  IF v_pkg.status <> 'active' THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_invalido');
  END IF;

  IF v_pkg.used_sessions >= v_pkg.total_sessions THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_esgotado');
  END IF;

  v_new_used := v_pkg.used_sessions + 1;

  UPDATE public.client_packages SET
    used_sessions = v_new_used,
    status = CASE WHEN v_new_used >= total_sessions THEN 'completed' ELSE status END,
    updated_at = now()
  WHERE id = v_pkg.id;

  UPDATE public.appointments SET
    package_session_number = v_new_used
  WHERE id = v_appt.id;

  RETURN json_build_object(
    'ok', true,
    'consumed', true,
    'used_sessions', v_new_used,
    'total_sessions', v_pkg.total_sessions,
    'remaining', GREATEST(v_pkg.total_sessions - v_new_used, 0),
    'session_label', v_new_used::text || '/' || v_pkg.total_sessions::text,
    'is_last_session', (v_new_used = v_pkg.total_sessions)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_client_package_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_client_package_session(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_public_booking — não incrementa used_sessions no agendamento
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
  v_reserved int;
  v_dow int;
  v_team boolean;
  v_provider_count int;
  v_effective_provider_id uuid;
  v_pending_payment boolean := false;
  v_next_session int;
BEGIN
  PERFORM set_config('timezone', 'America/Sao_Paulo', true);
  v_session_num := NULL;

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
      v_pkg.used_sessions := 0;
      v_pending_payment := true;
      p_client_package_id := v_new_pkg_id;
    ELSE
      SELECT * INTO v_pkg
      FROM public.client_packages cp
      WHERE cp.id = p_client_package_id AND cp.company_id = comp.id AND cp.service_id = p_service_id;

      IF NOT FOUND OR v_pkg.status <> 'active' THEN
        RETURN json_build_object('ok', false, 'error', 'pacote_invalido');
      END IF;

      SELECT count(*)::int INTO v_reserved
      FROM public.appointments a
      WHERE a.client_package_id = v_pkg.id
        AND a.status <> 'cancelled'
        AND a.package_session_number IS NULL;

      IF v_pkg.used_sessions + v_reserved >= v_pkg.total_sessions THEN
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

      v_next_session := v_pkg.used_sessions + v_reserved + 1;
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
    v_effective_provider_id, p_client_package_id, NULL
  )
  RETURNING id INTO v_appt_id;

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
    'package_session_number', NULL,
    'package_next_session', v_next_session,
    'package_total_sessions', COALESCE(v_pkg.total_sessions, svc.package_sessions),
    'is_last_package_session', (
      v_next_session IS NOT NULL
      AND COALESCE(v_pkg.total_sessions, svc.package_sessions) IS NOT NULL
      AND v_next_session = COALESCE(v_pkg.total_sessions, svc.package_sessions)
    ),
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
-- confirm_client_package_payment — só ativa; sessão consumida ao Concluir/fechar comanda
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_client_package_payment(p_company_id uuid, p_client_package_id uuid)
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

  UPDATE public.client_packages SET
    status = 'active',
    paid_at = now(),
    payment_confirmed_at = now(),
    payment_confirmed_by = auth.uid(),
    updated_at = now()
  WHERE id = v_pkg.id;

  RETURN json_build_object(
    'ok', true,
    'client_package_id', v_pkg.id,
    'used_sessions', v_pkg.used_sessions,
    'total_sessions', v_pkg.total_sessions,
    'remaining', v_pkg.total_sessions - v_pkg.used_sessions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
  text, uuid, date, time, text, text, text, text, boolean, uuid, uuid
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
