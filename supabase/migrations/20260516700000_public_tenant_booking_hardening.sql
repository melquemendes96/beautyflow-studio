-- Alinha portal do cliente + create_public_booking com normalize_booking_slug e elegibilidade pública.
-- Valida horário contra get_available_slots; deduplica cliente por WhatsApp quando sem e-mail.

BEGIN;

-- Helper: resolve company_id elegível para fluxos públicos (booking + portal)
CREATE OR REPLACE FUNCTION public.resolve_public_company_id(p_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_public_company_id(text) IS
  'Retorna company_id para slug público elegível; NULL se inválido ou indisponível.';

-- ---------------------------------------------------------------------------
-- Portal do cliente: mesma resolução de slug que /agendar/:slug
-- ---------------------------------------------------------------------------
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
  v_email text;
  v_phone text;
  v_client_id uuid;
  upcoming json;
  history json;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'slug_obrigatorio');
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
    RETURN json_build_object(
      'ok', true,
      'company', json_build_object('name', comp.name, 'slug', comp.slug),
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
    'upcoming', upcoming,
    'history', history
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.client_cancel_appointment(
  p_slug text,
  p_email text,
  p_whatsapp text,
  p_appointment_id uuid
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
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'id_obrigatorio');
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

  UPDATE public.appointments SET status = 'cancelled' WHERE id = a.id;

  RETURN json_build_object('ok', true);
END;
$$;

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
      public.get_available_slots(comp.slug, a.service_id, p_new_date)::json
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

CREATE OR REPLACE FUNCTION public.client_submit_rating(
  p_slug text,
  p_email text,
  p_whatsapp text,
  p_appointment_id uuid,
  p_rating smallint,
  p_comment text DEFAULT NULL
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
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'id_obrigatorio');
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN json_build_object('ok', false, 'error', 'rating_invalido');
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

  IF a.status <> 'completed' THEN
    RETURN json_build_object('ok', false, 'error', 'status_invalido');
  END IF;

  INSERT INTO public.appointment_ratings (company_id, appointment_id, client_id, rating, comment)
  VALUES (comp.id, a.id, v_client_id, p_rating, NULLIF(trim(p_comment), ''));

  RETURN json_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'ja_avaliado');
END;
$$;

-- ---------------------------------------------------------------------------
-- Agendamento público: valida slot + dedup WhatsApp
-- ---------------------------------------------------------------------------
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
  v_start timestamp;
  v_end timestamp;
BEGIN
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

  v_slot := to_char(p_appointment_time, 'HH24:MI');
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements_text(
      public.get_available_slots(comp.slug, p_service_id, p_appointment_date)::json
    ) elem
    WHERE elem = v_slot
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  v_start := (p_appointment_date::timestamp + p_appointment_time);
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
    WHERE company_id = comp.id AND email = v_email
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
      whatsapp = COALESCE(NULLIF(trim(p_client_whatsapp), ''), whatsapp),
      notes = COALESCE(p_notes, notes)
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.appointments (
    company_id, client_id, service_id, appointment_date, appointment_time, status
  )
  VALUES (comp.id, v_client_id, p_service_id, p_appointment_date, p_appointment_time, 'scheduled')
  RETURNING id INTO v_appt_id;

  RETURN json_build_object('ok', true, 'appointment_id', v_appt_id, 'client_id', v_client_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_public_company_id(text) TO anon, authenticated;

COMMIT;
