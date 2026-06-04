-- Auditoria Fase 1 + 2:
-- - company_eligible_for_public_booking: exige assinatura active/trialing válida (bloqueia past_due só por companies.status)
-- - WhatsApp send: token único por log (send_token) exigido na Edge send-whatsapp-message

BEGIN;

-- ---------------------------------------------------------------------------
-- Fase 2: elegibilidade agendamento público alinhada ao guard de assinatura
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.company_eligible_for_public_booking(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.status <> 'suspended'::public.company_status
      AND EXISTS (
        SELECT 1
        FROM public.tenant_subscriptions ts
        WHERE ts.company_id = c.id
          AND (
            (
              ts.status = 'active'::public.subscription_status
              AND (
                ts.current_period_end IS NULL
                OR ts.current_period_end::date >= CURRENT_DATE
              )
            )
            OR (
              ts.status = 'trialing'::public.subscription_status
              AND (
                ts.trial_start IS NULL
                OR ts.trial_start <= now()
              )
              AND (
                COALESCE(ts.trial_end, ts.current_period_end) IS NULL
                OR COALESCE(ts.trial_end, ts.current_period_end)::date >= CURRENT_DATE
              )
            )
          )
      )
  );
$$;

COMMENT ON FUNCTION public.company_eligible_for_public_booking(uuid) IS
  'Agendamento público: empresa não suspensa + assinatura active/trialing com período válido (nunca past_due/canceled).';

-- ---------------------------------------------------------------------------
-- Fase 1: token único por fila WhatsApp (validado na Edge Function)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_whatsapp_booking_confirmation(
  p_company_id uuid,
  p_appointment_id uuid,
  p_client_id uuid,
  p_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_send_token text;
  v_conn public.whatsapp_connections%ROWTYPE;
  v_tpl public.whatsapp_templates%ROWTYPE;
BEGIN
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RETURN NULL;
  END IF;

  IF NOT public.company_has_plan_feature(p_company_id, 'whatsapp') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_conn
  FROM public.whatsapp_connections
  WHERE company_id = p_company_id
    AND status = 'active';

  IF NOT FOUND OR v_conn.access_token_encrypted IS NULL OR length(trim(v_conn.access_token_encrypted)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_tpl
  FROM public.whatsapp_templates
  WHERE company_id = p_company_id
    AND type = 'booking_confirmation'
    AND status = 'approved'
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_tpl
    FROM public.whatsapp_templates
    WHERE company_id = p_company_id
      AND type = 'booking_confirmation'
    LIMIT 1;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.whatsapp_message_logs
    WHERE appointment_id = p_appointment_id
      AND message_type = 'booking_confirmation'
      AND status IN ('pending', 'sent', 'delivered', 'read')
  ) THEN
    RETURN NULL;
  END IF;

  v_send_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.whatsapp_message_logs (
    company_id,
    appointment_id,
    client_id,
    phone,
    message_type,
    payload,
    status
  )
  VALUES (
    p_company_id,
    p_appointment_id,
    p_client_id,
    trim(p_phone),
    'booking_confirmation',
    json_build_object(
      'template_type', 'booking_confirmation',
      'template_name', COALESCE(v_tpl.template_name, 'booking_confirmation'),
      'language', COALESCE(v_tpl.language, 'pt_BR'),
      'send_token', v_send_token
    ),
    'pending'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
