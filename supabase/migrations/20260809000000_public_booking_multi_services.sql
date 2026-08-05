-- Agendamento público multi-serviço: slots pela duração total + appointments sequenciais.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_available_slots_multi(
  p_slug text,
  p_service_ids uuid[],
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
  bs public.business_settings%ROWTYPE;
  v_interval integer;
  v_notice integer;
  v_open time;
  v_close time;
  v_working jsonb;
  v_service_minutes integer;
  v_day_index integer;
  v_count int;
  slots json;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 OR p_date IS NULL
     OR p_service_ids IS NULL OR coalesce(array_length(p_service_ids, 1), 0) = 0 THEN
    RETURN '[]'::json;
  END IF;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.services s
  WHERE s.company_id = comp.id
    AND s.active = true
    AND s.id = ANY (p_service_ids);

  IF v_count <> coalesce(array_length(p_service_ids, 1), 0) THEN
    RETURN '[]'::json;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = ANY (p_service_ids)
      AND s.company_id = comp.id
      AND coalesce(s.service_kind, 'single') = 'package'
  ) THEN
    RETURN '[]'::json;
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

  SELECT COALESCE(sum(COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0)), 0)::int
  INTO v_service_minutes
  FROM public.services s
  WHERE s.id = ANY (p_service_ids) AND s.company_id = comp.id;

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

REVOKE ALL ON FUNCTION public.get_available_slots_multi(text, uuid[], date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots_multi(text, uuid[], date, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_providers_multi(
  p_slug text,
  p_service_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_need int;
  result json;
BEGIN
  IF p_slug IS NULL OR p_service_ids IS NULL OR coalesce(array_length(p_service_ids, 1), 0) = 0 THEN
    RETURN '[]'::json;
  END IF;

  v_need := array_length(p_service_ids, 1);

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  IF NOT public.company_has_plan_feature(comp.id, 'team') THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.sort_order, t.display_name), '[]'::json)
  INTO result
  FROM (
    SELECT
      sp.id,
      sp.display_name,
      sp.photo_url,
      sp.color,
      sp.is_owner,
      sp.sort_order
    FROM public.service_providers sp
    WHERE sp.company_id = comp.id
      AND sp.active = true
      AND (
        SELECT count(DISTINCT ps.service_id)::int
        FROM public.provider_services ps
        WHERE ps.provider_id = sp.id
          AND ps.service_id = ANY (p_service_ids)
      ) = v_need
  ) t;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_providers_multi(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_providers_multi(text, uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_public_booking_multi(
  p_slug text,
  p_service_ids uuid[],
  p_appointment_date date,
  p_appointment_time time,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text,
  p_notes text DEFAULT NULL,
  p_whatsapp_notifications boolean DEFAULT false,
  p_provider_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  v_client_id uuid;
  v_email text;
  v_phone text;
  v_slot text;
  v_time time;
  v_cursor timestamp;
  v_team boolean;
  v_provider_count int;
  v_effective_provider_id uuid;
  v_sid uuid;
  v_appt_id uuid;
  v_dur int;
  v_svc_name text;
  v_first_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_names text[] := ARRAY[]::text[];
  v_notes text;
  v_whatsapp_log_id uuid;
  v_whatsapp_send_token text;
  v_phone_out text;
  v_count int;
  r record;
BEGIN
  PERFORM set_config('timezone', 'America/Sao_Paulo', true);

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'slug_obrigatorio');
  END IF;

  IF p_service_ids IS NULL OR coalesce(array_length(p_service_ids, 1), 0) = 0
     OR p_appointment_date IS NULL OR p_appointment_time IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'nome_obrigatorio');
  END IF;

  IF p_client_whatsapp IS NULL OR length(trim(p_client_whatsapp)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_obrigatorio');
  END IF;

  IF array_length(p_service_ids, 1) = 1 THEN
    RETURN public.create_public_booking(
      p_slug,
      p_service_ids[1],
      p_appointment_date,
      p_appointment_time,
      p_client_name,
      p_client_email,
      p_client_whatsapp,
      p_notes,
      p_whatsapp_notifications,
      p_provider_id,
      NULL
    );
  END IF;

  v_time := p_appointment_time::time;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.services s
  WHERE s.company_id = comp.id AND s.active = true AND s.id = ANY (p_service_ids);

  IF v_count <> array_length(p_service_ids, 1) THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = ANY (p_service_ids)
      AND s.company_id = comp.id
      AND coalesce(s.service_kind, 'single') = 'package'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'multi_nao_suporta_pacote');
  END IF;

  v_team := public.company_has_plan_feature(comp.id, 'team');
  v_effective_provider_id := p_provider_id;

  IF v_team THEN
    SELECT coalesce(json_array_length(
      public.list_public_providers_multi(public.normalize_booking_slug(p_slug), p_service_ids)
    ), 0)
    INTO v_provider_count;

    IF v_provider_count > 0 AND v_effective_provider_id IS NULL THEN
      RETURN json_build_object('ok', false, 'error', 'prestador_obrigatorio');
    END IF;

    IF v_effective_provider_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM json_array_elements(
        public.list_public_providers_multi(public.normalize_booking_slug(p_slug), p_service_ids)
      ) elem
      WHERE (elem->>'id')::uuid = v_effective_provider_id
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

  v_slot := to_char(v_time, 'HH24:MI');
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements_text(
      public.get_available_slots_multi(
        public.normalize_booking_slug(p_slug),
        p_service_ids,
        p_appointment_date,
        v_effective_provider_id
      )::json
    ) elem
    WHERE elem = v_slot
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  SELECT array_agg(s.name ORDER BY ord.ord)
  INTO v_names
  FROM unnest(p_service_ids) WITH ORDINALITY AS ord(id, ord)
  JOIN public.services s ON s.id = ord.id;

  v_notes := trim(both FROM concat_ws(
    E'\n',
    NULLIF(trim(coalesce(p_notes, '')), ''),
    'Serviços: ' || array_to_string(v_names, ', ')
  ));

  v_cursor := (p_appointment_date::timestamp + v_time);

  FOR r IN
    SELECT ord.id AS service_id, s.name, COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0) AS mins
    FROM unnest(p_service_ids) WITH ORDINALITY AS ord(id, ord)
    JOIN public.services s ON s.id = ord.id
    ORDER BY ord.ord
  LOOP
    v_sid := r.service_id;
    v_svc_name := r.name;
    v_dur := r.mins;

    INSERT INTO public.appointments (
      company_id, client_id, service_id, appointment_date, appointment_time, status,
      provider_id, notes
    )
    VALUES (
      comp.id,
      v_client_id,
      v_sid,
      p_appointment_date,
      v_cursor::time,
      'scheduled',
      v_effective_provider_id,
      CASE
        WHEN v_first_id IS NULL THEN v_notes
        ELSE 'Parte do agendamento multi · ' || v_svc_name
      END
    )
    RETURNING id INTO v_appt_id;

    v_ids := array_append(v_ids, v_appt_id);
    IF v_first_id IS NULL THEN
      v_first_id := v_appt_id;
    END IF;

    v_cursor := v_cursor + make_interval(mins => v_dur);
  END LOOP;

  IF COALESCE(p_whatsapp_notifications, false) AND v_phone IS NOT NULL AND v_first_id IS NOT NULL THEN
    v_phone_out := COALESCE(v_phone, public.norm_phone(p_client_whatsapp));
    v_whatsapp_log_id := public.queue_whatsapp_booking_confirmation(
      comp.id, v_first_id, v_client_id, COALESCE(v_phone_out, trim(p_client_whatsapp))
    );
    IF v_whatsapp_log_id IS NOT NULL THEN
      SELECT payload->>'send_token' INTO v_whatsapp_send_token
      FROM public.whatsapp_message_logs WHERE id = v_whatsapp_log_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_first_id,
    'appointment_ids', to_json(v_ids),
    'client_id', v_client_id,
    'company_id', comp.id,
    'appointment_date', p_appointment_date,
    'appointment_time', v_slot,
    'service_count', array_length(p_service_ids, 1),
    'pending_payment', false,
    'whatsapp_queued', (v_whatsapp_log_id IS NOT NULL),
    'whatsapp_log_id', v_whatsapp_log_id,
    'whatsapp_send_token', v_whatsapp_send_token
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_booking_multi(
  text, uuid[], date, time, text, text, text, text, boolean, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking_multi(
  text, uuid[], date, time, text, text, text, text, boolean, uuid
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
