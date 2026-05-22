-- Corrige agendamento público → appointments visíveis na agenda admin.
-- - Timezone America/Sao_Paulo em slots e validação
-- - Transação atômica (cliente + appointment)
-- - Normalização explícita de appointment_time

BEGIN;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date
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
  slots json;
BEGIN
  PERFORM set_config('timezone', 'America/Sao_Paulo', true);

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN '[]'::json;
  END IF;
  IF p_service_id IS NULL OR p_date IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT *
  INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  SELECT *
  INTO svc
  FROM public.services
  WHERE id = p_service_id
    AND company_id = comp.id
    AND active = true;

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  SELECT *
  INTO bs
  FROM public.business_settings
  WHERE company_id = comp.id;

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
  ),
  candidates AS (
    SELECT
      gs AS start_ts,
      (gs + (SELECT svc_len FROM cfg)) AS end_ts
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
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE c.start_ts < b.b_end AND c.end_ts > b.b_start
      )
      AND NOT EXISTS (
        SELECT 1 FROM appts a
        WHERE c.start_ts < a.a_end AND c.end_ts > a.a_start
      )
  )
  SELECT COALESCE(json_agg(to_char(start_ts, 'HH24:MI') ORDER BY start_ts), '[]'::json)
  INTO slots
  FROM available;

  RETURN slots;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text,
  p_notes text DEFAULT NULL
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

  IF (p_client_email IS NULL OR length(trim(p_client_email)) = 0)
     AND (p_client_whatsapp IS NULL OR length(trim(p_client_whatsapp)) = 0) THEN
    RETURN json_build_object('ok', false, 'error', 'email_ou_whatsapp_obrigatorio');
  END IF;

  v_time := p_appointment_time::time;

  SELECT *
  INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT *
  INTO svc
  FROM public.services
  WHERE id = p_service_id
    AND company_id = comp.id
    AND active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  v_slot := to_char(v_time, 'HH24:MI');
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements_text(
      public.get_available_slots(public.normalize_booking_slug(p_slug), p_service_id, p_appointment_date)::json
    ) elem
    WHERE elem = v_slot
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  v_start := (p_appointment_date::timestamp + v_time);
  v_end := v_start + make_interval(mins => (COALESCE(svc.duration_minutes, 0) + COALESCE(svc.buffer_minutes, 0)));

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.company_id = comp.id
      AND a.appointment_date = p_appointment_date
      AND a.status <> 'cancelled'
      AND v_start < (p_appointment_date::timestamp + a.appointment_time)
        + make_interval(mins => (COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0)))
      AND v_end > (p_appointment_date::timestamp + a.appointment_time)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  v_email := NULLIF(lower(trim(p_client_email)), '');
  v_phone := public.norm_phone(p_client_whatsapp);

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE company_id = comp.id AND lower(trim(coalesce(email, ''))) = v_email
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE company_id = comp.id AND public.norm_phone(whatsapp) = v_phone
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (company_id, name, email, whatsapp, notes)
    VALUES (comp.id, trim(p_client_name), v_email, NULLIF(trim(p_client_whatsapp), ''), p_notes)
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients
    SET
      name = COALESCE(NULLIF(trim(p_client_name), ''), name),
      email = COALESCE(v_email, email),
      whatsapp = COALESCE(NULLIF(trim(p_client_whatsapp), ''), whatsapp),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.appointments (
    company_id, client_id, service_id, appointment_date, appointment_time, status
  )
  VALUES (comp.id, v_client_id, p_service_id, p_appointment_date, v_time, 'scheduled')
  RETURNING id INTO v_appt_id;

  IF v_appt_id IS NULL THEN
    RAISE EXCEPTION 'appointment_insert_failed';
  END IF;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'client_id', v_client_id,
    'company_id', comp.id,
    'appointment_date', p_appointment_date,
    'appointment_time', v_slot
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

COMMENT ON FUNCTION public.create_public_booking IS
  'Agendamento público: cliente + appointment (scheduled), timezone America/Sao_Paulo, anti double-book.';

COMMIT;
