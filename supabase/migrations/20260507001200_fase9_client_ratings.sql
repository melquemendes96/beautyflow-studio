-- Fase 9.2 — Avaliação do atendimento no portal do cliente (RPC segura)
-- - Inclui rating no get_client_portal_data
-- - RPC client_submit_rating com validação de vínculo e status completed

BEGIN;

-- Atualiza get_client_portal_data para incluir rating quando existir
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

GRANT EXECUTE ON FUNCTION public.get_client_portal_data(text, text, text) TO anon, authenticated;

-- RPC: registrar avaliação (1..5) para um atendimento concluído
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

GRANT EXECUTE ON FUNCTION public.client_submit_rating(text, text, text, uuid, smallint, text) TO anon, authenticated;
COMMENT ON FUNCTION public.client_submit_rating(text, text, text, uuid, smallint, text) IS 'Fase 9.2: registra avaliação do cliente para atendimento concluído.';

COMMIT;

