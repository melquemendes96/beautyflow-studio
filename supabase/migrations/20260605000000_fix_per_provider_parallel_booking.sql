-- Agenda independente por prestador: mesmo horário para prestadores diferentes
-- Corrige índice único legado (company+date+time) e conflitos por provider_id

-- ---------------------------------------------------------------------------
-- Índice: unicidade por prestador (ou studio quando provider_id IS NULL)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_appointments_company_date_time_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_company_date_time_provider_unique
  ON public.appointments (company_id, appointment_date, appointment_time, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_company_date_time_no_provider_unique
  ON public.appointments (company_id, appointment_date, appointment_time)
  WHERE provider_id IS NULL;

-- ---------------------------------------------------------------------------
-- get_available_slots — conflitos só do prestador selecionado
-- ---------------------------------------------------------------------------
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
    WHERE sb.company_id = comp.id
      AND sb.block_date = p_date
      AND (
        sb.provider_id IS NULL
        OR sb.provider_id IS NOT DISTINCT FROM p_provider_id
      )
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
        OR a.provider_id IS NOT DISTINCT FROM p_provider_id
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
-- create_public_booking — overlap só no mesmo prestador
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
      AND (
        p_provider_id IS NULL
        OR a.provider_id IS NOT DISTINCT FROM p_provider_id
      )
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

-- ---------------------------------------------------------------------------
-- client_reschedule_appointment — respeita agenda do prestador do agendamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_reschedule_appointment(
  p_slug text,
  p_email text,
  p_whatsapp text,
  p_appointment_id uuid,
  p_new_date date,
  p_new_time time
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_company_id uuid;
  v_email text;
  v_phone text;
  v_client_id uuid;
  a public.appointments%ROWTYPE;
  svc public.services%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  v_notice int;
  v_start timestamp;
  v_end timestamp;
  v_week_idx int;
  v_working jsonb;
  v_slot text;
BEGIN
  IF p_appointment_id IS NULL OR p_new_date IS NULL OR p_new_time IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  v_email := NULLIF(lower(trim(p_email)), '');
  v_phone := public.norm_phone(p_whatsapp);
  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'email_ou_whatsapp_obrigatorio');
  END IF;

  v_company_id := public.resolve_public_company_id(p_slug);
  IF v_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT * INTO comp FROM public.companies WHERE id = v_company_id;

  SELECT c.id
  INTO v_client_id
  FROM public.clients c
  WHERE c.company_id = comp.id
    AND (
      (v_email IS NOT NULL AND lower(c.email) = v_email)
      OR (v_phone IS NOT NULL AND public.norm_phone(c.whatsapp) = v_phone)
    )
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'cliente_nao_encontrado');
  END IF;

  SELECT * INTO a
  FROM public.appointments
  WHERE id = p_appointment_id
    AND company_id = comp.id
    AND client_id = v_client_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF a.status NOT IN ('scheduled', 'confirmed') THEN
    RETURN json_build_object('ok', false, 'error', 'status_invalido');
  END IF;

  SELECT * INTO svc
  FROM public.services
  WHERE id = a.service_id AND company_id = comp.id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  v_slot := to_char(p_new_time, 'HH24:MI');
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements_text(
      public.get_available_slots(comp.slug, a.service_id, p_new_date, a.provider_id)::json
    ) elem
    WHERE elem = v_slot
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  SELECT * INTO bs FROM public.business_settings WHERE company_id = comp.id;

  v_notice := COALESCE(bs.min_schedule_notice_hours, 2);
  v_start := (p_new_date::timestamp + p_new_time);
  IF v_start < (now() + make_interval(hours => v_notice)) THEN
    RETURN json_build_object('ok', false, 'error', 'prazo_minimo');
  END IF;

  v_working := COALESCE(bs.working_days, '[true,true,true,true,true,true,false]'::jsonb);
  v_week_idx := (extract(isodow from p_new_date)::int - 1);
  IF jsonb_typeof(v_working) = 'array' AND jsonb_array_length(v_working) = 7 THEN
    IF COALESCE((v_working ->> v_week_idx)::boolean, false) = false THEN
      RETURN json_build_object('ok', false, 'error', 'dia_indisponivel');
    END IF;
  END IF;

  v_end := v_start + make_interval(mins => (COALESCE(svc.duration_minutes, 0) + COALESCE(svc.buffer_minutes, 0)));

  IF EXISTS (
    SELECT 1
    FROM public.appointments ax
    JOIN public.services sx ON sx.id = ax.service_id
    WHERE ax.company_id = comp.id
      AND ax.appointment_date = p_new_date
      AND ax.status <> 'cancelled'
      AND ax.id <> a.id
      AND (
        a.provider_id IS NULL
        OR ax.provider_id IS NOT DISTINCT FROM a.provider_id
      )
      AND v_start < (p_new_date::timestamp + ax.appointment_time)
        + make_interval(mins => (COALESCE(sx.duration_minutes, 0) + COALESCE(sx.buffer_minutes, 0)))
      AND v_end > (p_new_date::timestamp + ax.appointment_time)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  UPDATE public.appointments
  SET appointment_date = p_new_date, appointment_time = p_new_time
  WHERE id = a.id;

  RETURN json_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_reschedule_appointment(text, text, text, uuid, date, time) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
