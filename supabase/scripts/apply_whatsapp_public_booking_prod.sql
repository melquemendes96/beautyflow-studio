-- WhatsApp Fases B–F: RPCs admin, templates, fila pós-agendamento, opt-in público.
-- Idempotente: remove overloads quebrados (migration manual / params errados em prod).

BEGIN;

DROP FUNCTION IF EXISTS public.create_public_booking(
  text, uuid, date, time without time zone, text, text, text, text
);
DROP FUNCTION IF EXISTS public.create_public_booking(
  text, uuid, date, time without time zone, text, text, text, text, boolean
);
DROP FUNCTION IF EXISTS public.get_booking_page_data(text);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_whatsapp_admin_for_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required';
  END IF;

  IF public.is_platform_admin() THEN
    RETURN;
  END IF;

  IF NOT (p_company_id IN (SELECT public.current_user_owner_admin_company_ids())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.company_has_plan_feature(p_company_id, 'whatsapp') THEN
    RAISE EXCEPTION 'plan_feature_whatsapp_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_whatsapp_admin_for_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_whatsapp_admin_for_company(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fase B: get / save connection (token nunca retornado ao cliente)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_whatsapp_connection(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.whatsapp_connections%ROWTYPE;
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  SELECT * INTO row
  FROM public.whatsapp_connections
  WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'ok', true,
      'connection', NULL,
      'webhook_url_hint', NULL
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'connection', json_build_object(
      'id', row.id,
      'company_id', row.company_id,
      'provider', row.provider,
      'business_id', row.business_id,
      'phone_number_id', row.phone_number_id,
      'display_phone_number', row.display_phone_number,
      'webhook_verify_token', row.webhook_verify_token,
      'status', row.status,
      'has_access_token', (row.access_token_encrypted IS NOT NULL AND length(trim(row.access_token_encrypted)) > 0),
      'created_at', row.created_at,
      'updated_at', row.updated_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_whatsapp_connection(
  p_company_id uuid,
  p_business_id text,
  p_phone_number_id text,
  p_display_phone_number text DEFAULT NULL,
  p_webhook_verify_token text DEFAULT NULL,
  p_access_token text DEFAULT NULL,
  p_status public.whatsapp_connection_status DEFAULT 'pending'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.whatsapp_connections%ROWTYPE;
  v_token text;
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  IF p_phone_number_id IS NULL OR length(trim(p_phone_number_id)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'phone_number_id_obrigatorio');
  END IF;

  IF p_business_id IS NULL OR length(trim(p_business_id)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'business_id_obrigatorio');
  END IF;

  v_token := NULLIF(trim(p_access_token), '');

  INSERT INTO public.whatsapp_connections (
    company_id,
    provider,
    business_id,
    phone_number_id,
    display_phone_number,
    webhook_verify_token,
    access_token_encrypted,
    status
  )
  VALUES (
    p_company_id,
    'meta_cloud_api',
    trim(p_business_id),
    trim(p_phone_number_id),
    NULLIF(trim(p_display_phone_number), ''),
    NULLIF(trim(p_webhook_verify_token), ''),
    v_token,
    COALESCE(p_status, 'pending'::public.whatsapp_connection_status)
  )
  ON CONFLICT (company_id) DO UPDATE SET
    business_id = EXCLUDED.business_id,
    phone_number_id = EXCLUDED.phone_number_id,
    display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_connections.display_phone_number),
    webhook_verify_token = COALESCE(EXCLUDED.webhook_verify_token, whatsapp_connections.webhook_verify_token),
    access_token_encrypted = CASE
      WHEN v_token IS NOT NULL THEN v_token
      ELSE whatsapp_connections.access_token_encrypted
    END,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO row;

  RETURN json_build_object(
    'ok', true,
    'connection', json_build_object(
      'id', row.id,
      'company_id', row.company_id,
      'business_id', row.business_id,
      'phone_number_id', row.phone_number_id,
      'display_phone_number', row.display_phone_number,
      'webhook_verify_token', row.webhook_verify_token,
      'status', row.status,
      'has_access_token', (row.access_token_encrypted IS NOT NULL AND length(trim(row.access_token_encrypted)) > 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_message_stats(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent bigint;
  v_failed bigint;
  v_inbound bigint;
  v_pending bigint;
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  SELECT
    count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE message_type = 'inbound'),
    count(*) FILTER (WHERE status = 'pending')
  INTO v_sent, v_failed, v_inbound, v_pending
  FROM public.whatsapp_message_logs
  WHERE company_id = p_company_id
    AND created_at > now() - interval '30 days';

  RETURN json_build_object(
    'ok', true,
    'sent', COALESCE(v_sent, 0),
    'failed', COALESCE(v_failed, 0),
    'inbound', COALESCE(v_inbound, 0),
    'pending', COALESCE(v_pending, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Fase E: templates (espelho local; aprovação real na Meta)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_company_type
  ON public.whatsapp_templates (company_id, type);

CREATE OR REPLACE FUNCTION public.list_whatsapp_templates(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  RETURN json_build_object(
    'ok', true,
    'templates', COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', t.id,
          'type', t.type,
          'template_name', t.template_name,
          'language', t.language,
          'body_preview', t.body_preview,
          'status', t.status,
          'created_at', t.created_at
        )
        ORDER BY t.type
      )
      FROM public.whatsapp_templates t
      WHERE t.company_id = p_company_id
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_whatsapp_template(
  p_company_id uuid,
  p_type text,
  p_template_name text,
  p_language text DEFAULT 'pt_BR',
  p_body_preview text DEFAULT NULL,
  p_status public.whatsapp_template_status DEFAULT 'draft'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  IF p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'type_obrigatorio');
  END IF;

  IF p_template_name IS NULL OR length(trim(p_template_name)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'template_name_obrigatorio');
  END IF;

  INSERT INTO public.whatsapp_templates (
    company_id, type, template_name, language, body_preview, status
  )
  VALUES (
    p_company_id,
    trim(p_type),
    trim(p_template_name),
    COALESCE(NULLIF(trim(p_language), ''), 'pt_BR'),
    NULLIF(trim(p_body_preview), ''),
    COALESCE(p_status, 'draft'::public.whatsapp_template_status)
  )
  ON CONFLICT (company_id, type) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    language = EXCLUDED.language,
    body_preview = COALESCE(EXCLUDED.body_preview, whatsapp_templates.body_preview),
    status = EXCLUDED.status
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_whatsapp_templates_defaults(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_whatsapp_admin_for_company(p_company_id);

  INSERT INTO public.whatsapp_templates (company_id, type, template_name, language, body_preview, status)
  VALUES
    (
      p_company_id,
      'booking_confirmation',
      'booking_confirmation',
      'pt_BR',
      'Olá {{1}}, seu agendamento de {{2}} está confirmado para {{3}} às {{4}}. Até lá!',
      'draft'::public.whatsapp_template_status
    ),
    (
      p_company_id,
      'booking_reminder',
      'booking_reminder',
      'pt_BR',
      'Olá {{1}}, lembrete: amanhã você tem {{2}} às {{3}}. Qualquer dúvida, responda esta mensagem.',
      'draft'::public.whatsapp_template_status
    )
  ON CONFLICT (company_id, type) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fase F: fila confirmação após agendamento
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
      'language', COALESCE(v_tpl.language, 'pt_BR')
    ),
    'pending'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_whatsapp_booking_confirmation(uuid, uuid, uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- create_public_booking + opt-in WhatsApp
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
  END IF;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'client_id', v_client_id,
    'company_id', comp.id,
    'appointment_date', p_appointment_date,
    'appointment_time', v_slot,
    'whatsapp_queued', (v_whatsapp_log_id IS NOT NULL),
    'whatsapp_log_id', v_whatsapp_log_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

COMMENT ON FUNCTION public.create_public_booking IS
  'Agendamento público + opt-in WhatsApp (fila booking_confirmation em whatsapp_message_logs).';

-- Grants
REVOKE ALL ON FUNCTION public.get_whatsapp_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_connection(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.save_whatsapp_connection(
  uuid, text, text, text, text, text, public.whatsapp_connection_status
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_whatsapp_connection(
  uuid, text, text, text, text, text, public.whatsapp_connection_status
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_whatsapp_message_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_message_stats(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_whatsapp_templates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_whatsapp_templates(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_whatsapp_template(
  uuid, text, text, text, text, public.whatsapp_template_status
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_whatsapp_template(
  uuid, text, text, text, text, public.whatsapp_template_status
) TO authenticated;

REVOKE ALL ON FUNCTION public.seed_whatsapp_templates_defaults(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_whatsapp_templates_defaults(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
  text, uuid, date, time, text, text, text, text, boolean
) TO anon, authenticated;

-- Flag pública para exibir opt-in no agendamento
CREATE OR REPLACE FUNCTION public.get_booking_page_data(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_slug text;
  c public.companies%ROWTYPE;
  b public.branding_settings%ROWTYPE;
  j json;
  v_whatsapp_available boolean;
BEGIN
  v_slug := public.normalize_booking_slug(p_slug);
  IF v_slug IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO c
  FROM public.companies
  WHERE slug = v_slug;

  IF NOT FOUND OR NOT public.company_eligible_for_public_booking(c.id) THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO b
  FROM public.branding_settings
  WHERE company_id = c.id;

  v_whatsapp_available := public.company_has_plan_feature(c.id, 'whatsapp')
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_connections wc
      WHERE wc.company_id = c.id
        AND wc.status = 'active'
        AND wc.access_token_encrypted IS NOT NULL
        AND length(trim(wc.access_token_encrypted)) > 0
    );

  SELECT coalesce(
    (
      SELECT json_agg(svc.obj)
      FROM (
        SELECT json_build_object(
          'id', s.id,
          'name', s.name,
          'description', s.description,
          'price', s.price,
          'duration_minutes', s.duration_minutes,
          'buffer_minutes', s.buffer_minutes,
          'image_url', s.image_url,
          'category', s.category
        ) AS obj
        FROM public.services s
        WHERE s.company_id = c.id
          AND s.active = true
        ORDER BY s.name
      ) svc
    ),
    '[]'::json
  )
  INTO j;

  RETURN json_build_object(
    'company',
    json_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'email', c.email,
      'phone', c.phone,
      'status', c.status
    ),
    'branding',
    CASE
      WHEN b.id IS NULL THEN NULL::json
      ELSE (to_jsonb(b) - 'id' - 'company_id' - 'created_at' - 'updated_at')::json
    END,
    'services',
    j,
    'whatsapp_notifications_available',
    v_whatsapp_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_page_data(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
