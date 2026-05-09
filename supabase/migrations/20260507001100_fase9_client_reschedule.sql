-- Fase 9.1 — Reagendamento no portal do cliente (RPC segura)
-- - Adiciona service_id no get_client_portal_data
-- - RPC client_reschedule_appointment com validação e anti-overlap/bloqueios

BEGIN;

-- Atualiza o payload do portal para incluir service_id (necessário para calcular slots)
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

  SELECT *
  INTO comp
  FROM public.companies
  WHERE slug = trim(p_slug)
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

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
      'start_at', (a.appointment_date::timestamp + a.appointment_time)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
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
      'start_at', (a.appointment_date::timestamp + a.appointment_time)
    ) AS obj
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
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

GRANT EXECUTE ON FUNCTION public.get_client_portal_data(text, text, text) TO anon, authenticated;

-- RPC: reagendar (cliente)
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
BEGIN
  IF p_appointment_id IS NULL OR p_new_date IS NULL OR p_new_time IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  v_email := NULLIF(lower(trim(p_email)), '');
  v_phone := public.norm_phone(p_whatsapp);
  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'email_ou_whatsapp_obrigatorio');
  END IF;

  SELECT * INTO comp FROM public.companies WHERE slug = trim(p_slug) AND status = 'active';
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

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
  WHERE id = a.service_id
    AND company_id = comp.id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  SELECT * INTO bs
  FROM public.business_settings
  WHERE company_id = comp.id;

  v_notice := COALESCE(bs.min_schedule_notice_hours, 2);
  v_start := (p_new_date::timestamp + p_new_time);
  IF v_start < (now() + make_interval(hours => v_notice)) THEN
    RETURN json_build_object('ok', false, 'error', 'prazo_minimo');
  END IF;

  -- Valida dia útil (working_days como array [Seg..Dom])
  v_working := COALESCE(bs.working_days, '[true,true,true,true,true,true,false]'::jsonb);
  v_week_idx := (extract(isodow from p_new_date)::int - 1);
  IF jsonb_typeof(v_working) = 'array' AND jsonb_array_length(v_working) = 7 THEN
    IF COALESCE((v_working ->> v_week_idx)::boolean, false) = false THEN
      RETURN json_build_object('ok', false, 'error', 'dia_indisponivel');
    END IF;
  END IF;

  v_end := v_start + make_interval(mins => (COALESCE(svc.duration_minutes, 0) + COALESCE(svc.buffer_minutes, 0)));

  -- Bloqueios
  IF EXISTS (
    SELECT 1
    FROM public.schedule_blocks sb
    WHERE sb.company_id = comp.id
      AND sb.block_date = p_new_date
      AND (
        sb.block_type = 'day_full'
        OR (sb.block_type = 'morning_full' AND p_new_time < '12:00'::time)
        OR (sb.block_type = 'afternoon_full' AND p_new_time >= '12:00'::time)
        OR (
          sb.block_type = 'manual_block'
          AND (p_new_time < sb.time_end AND (p_new_time + make_interval(mins => (COALESCE(svc.duration_minutes,0) + COALESCE(svc.buffer_minutes,0))))::time > sb.time_start)
        )
      )
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
  END IF;

  -- Overlap com outros agendamentos (exceto ele mesmo)
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
  SET
    appointment_date = p_new_date,
    appointment_time = p_new_time
  WHERE id = a.id;

  RETURN json_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'horario_indisponivel');
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_reschedule_appointment(text, text, text, uuid, date, time) TO anon, authenticated;
COMMENT ON FUNCTION public.client_reschedule_appointment(text, text, text, uuid, date, time) IS 'Fase 9.1: reagenda agendamento do cliente validando slug+contato e disponibilidade.';

COMMIT;

