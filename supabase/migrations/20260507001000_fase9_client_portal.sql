-- Fase 9 — Área do Cliente (RPCs públicas seguras)
-- - Consulta de próximos atendimentos e histórico via e-mail + WhatsApp (sem expor company_id)
-- - Cancelamento com validação de vínculo
-- - Reagendamento com validação de disponibilidade (usa lógica de overlap)

BEGIN;

-- Normalização simples de WhatsApp: deixa só dígitos (ex.: "(11) 99999-0000" -> "11999990000")
CREATE OR REPLACE FUNCTION public.norm_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

GRANT EXECUTE ON FUNCTION public.norm_phone(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: dados do portal do cliente
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

  -- resolve client dentro da empresa
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
    RETURN json_build_object('ok', true, 'company', json_build_object('name', comp.name, 'slug', comp.slug), 'upcoming', '[]'::json, 'history', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(obj ORDER BY obj->>'start_at'), '[]'::json)
  INTO upcoming
  FROM (
    SELECT json_build_object(
      'id', a.id,
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
COMMENT ON FUNCTION public.get_client_portal_data(text, text, text) IS 'Fase 9: portal do cliente por slug+email/whatsapp; retorna próximos atendimentos e histórico.';

-- ---------------------------------------------------------------------------
-- RPC: cancelar agendamento do cliente
-- ---------------------------------------------------------------------------
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

  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE id = a.id;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(text, text, text, uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.client_cancel_appointment(text, text, text, uuid) IS 'Fase 9: cancela agendamento do cliente validando slug + email/whatsapp.';

COMMIT;

