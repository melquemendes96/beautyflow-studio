-- WhatsApp Fase G + H: lembretes 24h, logs admin, checklist Meta.
-- Fase 4 operacional Meta (código): cron enfileira lembretes; admin vê histórico e status.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fila lembrete 24h (só clientes que optaram na confirmação do mesmo agendamento)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_whatsapp_booking_reminder(
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

  IF NOT public.company_eligible_for_public_booking(p_company_id) THEN
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
    AND type = 'booking_reminder'
    AND status = 'approved'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_message_logs
    WHERE appointment_id = p_appointment_id
      AND message_type = 'booking_confirmation'
      AND status IN ('pending', 'sent', 'delivered', 'read')
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.whatsapp_message_logs
    WHERE appointment_id = p_appointment_id
      AND message_type = 'booking_reminder'
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
    'booking_reminder',
    json_build_object(
      'template_type', 'booking_reminder',
      'template_name', COALESCE(v_tpl.template_name, 'booking_reminder'),
      'language', COALESCE(v_tpl.language, 'pt_BR'),
      'send_token', v_send_token
    ),
    'pending'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_whatsapp_booking_reminder(uuid, uuid, uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Enfileira lembretes para agendamentos de amanhã (timezone São Paulo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_reminders_due()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target date;
  v_row record;
  v_log_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_phone text;
BEGIN
  PERFORM set_config('timezone', 'America/Sao_Paulo', true);
  v_target := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1;

  FOR v_row IN
    SELECT
      a.id AS appointment_id,
      a.company_id,
      a.client_id,
      COALESCE(public.norm_phone(c.whatsapp), public.norm_phone(wl.phone)) AS phone_norm,
      COALESCE(NULLIF(trim(c.whatsapp), ''), NULLIF(trim(wl.phone), '')) AS phone_raw
    FROM public.appointments a
    JOIN public.clients c ON c.id = a.client_id
    LEFT JOIN LATERAL (
      SELECT phone
      FROM public.whatsapp_message_logs
      WHERE appointment_id = a.id
        AND message_type = 'booking_confirmation'
        AND status IN ('pending', 'sent', 'delivered', 'read')
      ORDER BY created_at DESC
      LIMIT 1
    ) wl ON true
    WHERE a.appointment_date = v_target
      AND a.status NOT IN ('cancelled')
      AND (
        (c.whatsapp IS NOT NULL AND length(trim(c.whatsapp)) > 0)
        OR wl.phone IS NOT NULL
      )
  LOOP
    v_phone := COALESCE(v_row.phone_raw, v_row.phone_norm);
    IF v_phone IS NULL OR length(trim(v_phone)) = 0 THEN
      CONTINUE;
    END IF;

    v_log_id := public.queue_whatsapp_booking_reminder(
      v_row.company_id,
      v_row.appointment_id,
      v_row.client_id,
      v_phone
    );

    IF v_log_id IS NOT NULL THEN
      v_ids := array_append(v_ids, v_log_id);
    END IF;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'target_date', v_target,
    'enqueued_count', COALESCE(array_length(v_ids, 1), 0),
    'log_ids', to_json(v_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_whatsapp_reminders_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_whatsapp_reminders_due() TO service_role;

-- ---------------------------------------------------------------------------
-- Histórico de mensagens (admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_whatsapp_message_logs(
  p_company_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  RETURN json_build_object(
    'ok', true,
    'logs', COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', wl.id,
          'message_type', wl.message_type,
          'status', wl.status,
          'phone', wl.phone,
          'error_message', wl.error_message,
          'meta_message_id', wl.meta_message_id,
          'created_at', wl.created_at,
          'appointment_date', a.appointment_date,
          'appointment_time', to_char(a.appointment_time, 'HH24:MI'),
          'client_name', c.name,
          'service_name', s.name
        )
        ORDER BY wl.created_at DESC
      )
      FROM public.whatsapp_message_logs wl
      LEFT JOIN public.appointments a ON a.id = wl.appointment_id
      LEFT JOIN public.clients c ON c.id = wl.client_id
      LEFT JOIN public.services s ON s.id = a.service_id
      WHERE wl.company_id = p_company_id
      LIMIT v_limit
    ), '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_whatsapp_message_logs(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_whatsapp_message_logs(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Checklist onboarding Meta (admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_whatsapp_setup_status(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conn public.whatsapp_connections%ROWTYPE;
  v_confirm_status text;
  v_reminder_status text;
  v_feature boolean;
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  SELECT * INTO v_conn
  FROM public.whatsapp_connections
  WHERE company_id = p_company_id;

  v_feature := public.company_has_plan_feature(p_company_id, 'whatsapp');

  SELECT status::text INTO v_confirm_status
  FROM public.whatsapp_templates
  WHERE company_id = p_company_id AND type = 'booking_confirmation'
  LIMIT 1;

  SELECT status::text INTO v_reminder_status
  FROM public.whatsapp_templates
  WHERE company_id = p_company_id AND type = 'booking_reminder'
  LIMIT 1;

  RETURN json_build_object(
    'ok', true,
    'plan_has_whatsapp', v_feature,
    'connection', CASE
      WHEN v_conn.id IS NULL THEN NULL
      ELSE json_build_object(
        'status', v_conn.status,
        'has_business_id', v_conn.business_id IS NOT NULL AND length(trim(v_conn.business_id)) > 0,
        'has_phone_number_id', v_conn.phone_number_id IS NOT NULL AND length(trim(v_conn.phone_number_id)) > 0,
        'has_verify_token', v_conn.webhook_verify_token IS NOT NULL AND length(trim(v_conn.webhook_verify_token)) > 0,
        'has_access_token', v_conn.access_token_encrypted IS NOT NULL AND length(trim(v_conn.access_token_encrypted)) > 0,
        'display_phone_number', v_conn.display_phone_number
      )
    END,
    'template_confirmation_status', COALESCE(v_confirm_status, 'missing'),
    'template_reminder_status', COALESCE(v_reminder_status, 'missing'),
    'ready_to_send',
      v_feature
      AND v_conn.status = 'active'
      AND v_conn.access_token_encrypted IS NOT NULL
      AND length(trim(v_conn.access_token_encrypted)) > 0
      AND COALESCE(v_confirm_status, '') = 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_setup_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_setup_status(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
