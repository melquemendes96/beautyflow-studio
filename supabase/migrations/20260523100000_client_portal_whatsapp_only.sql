-- Portal do cliente: acesso e agendamento público por WhatsApp (e-mail opcional).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text,
  p_notes text DEFAULT NULL,
  p_whatsapp_notifications boolean DEFAULT false
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

  IF v_phone IS NULL OR length(v_phone) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'whatsapp_invalido');
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE company_id = comp.id AND lower(trim(coalesce(email, ''))) = v_email
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
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

  IF COALESCE(p_whatsapp_notifications, false) AND v_phone IS NOT NULL THEN
    v_phone_out := COALESCE(v_phone, public.norm_phone(p_client_whatsapp));
    v_whatsapp_log_id := public.queue_whatsapp_booking_confirmation(
      comp.id,
      v_appt_id,
      v_client_id,
      COALESCE(v_phone_out, trim(p_client_whatsapp))
    );

    IF v_whatsapp_log_id IS NOT NULL THEN
      SELECT payload->>'send_token'
      INTO v_whatsapp_send_token
      FROM public.whatsapp_message_logs
      WHERE id = v_whatsapp_log_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'client_id', v_client_id,
    'company_id', comp.id,
    'appointment_date', p_appointment_date,
    'appointment_time', v_slot,
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
  WHERE c.company_id = comp.id
    AND public.norm_phone(c.whatsapp) = v_phone
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN json_build_object(
      'ok', true,
      'company', json_build_object('name', comp.name, 'slug', comp.slug),
      'client', NULL,
      'upcoming', '[]'::json,
      'history', '[]'::json
    );
  END IF;

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
      'start_at', (a.appointment_date::timestamp + a.appointment_time)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.appointment_ratings r ON r.appointment_id = a.id
    WHERE a.company_id = comp.id
      AND a.client_id = v_client_id
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
      'start_at', (a.appointment_date::timestamp + a.appointment_time)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.appointment_ratings r ON r.appointment_id = a.id
    WHERE a.company_id = comp.id
      AND a.client_id = v_client_id
      AND (a.appointment_date::timestamp + a.appointment_time) < now() + interval '1 hour'
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
    LIMIT 100
  ) q;

  RETURN json_build_object(
    'ok', true,
    'company', json_build_object('name', comp.name, 'slug', comp.slug),
    'client', json_build_object(
      'name', v_client_name,
      'whatsapp', v_client_whatsapp
    ),
    'upcoming', upcoming,
    'history', history
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
