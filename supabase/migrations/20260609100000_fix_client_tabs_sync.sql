-- Corrige comandas órfãs (open + agendamento completed) e get_client_tab STABLE.

-- ---------------------------------------------------------------------------
-- create_client_tab_for_appointment — status alinhado ao agendamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_client_tab_for_appointment(p_appointment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_svc public.services%ROWTYPE;
  v_tab_id uuid;
  v_unit_price numeric(12, 2);
  v_desc text;
  v_pkg public.client_packages%ROWTYPE;
  v_tab_status text := 'open';
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_tab_id
  FROM public.client_tabs
  WHERE appointment_id = p_appointment_id;

  IF v_tab_id IS NOT NULL THEN
    RETURN v_tab_id;
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_appt.status IN ('cancelled', 'no_show') THEN
    v_tab_status := 'cancelled';
  ELSIF v_appt.status = 'completed' THEN
    v_tab_status := 'closed';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = v_appt.client_id;
  SELECT * INTO v_svc FROM public.services WHERE id = v_appt.service_id;

  IF v_appt.client_package_id IS NOT NULL THEN
    v_unit_price := 0;
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    v_desc := COALESCE(v_svc.name, 'Serviço') || ' (pacote · sessão)';
    IF v_pkg.id IS NOT NULL THEN
      v_desc := COALESCE(v_svc.name, 'Serviço')
        || ' (pacote · '
        || (v_pkg.used_sessions + 1)::text || '/' || v_pkg.total_sessions::text
        || ')';
    END IF;
  ELSE
    v_unit_price := COALESCE(v_svc.price, 0);
    v_desc := COALESCE(v_svc.name, 'Serviço');
  END IF;

  INSERT INTO public.client_tabs (
    company_id, appointment_id, client_id, provider_id, status, closed_at
  )
  VALUES (
    v_appt.company_id,
    v_appt.id,
    v_appt.client_id,
    v_appt.provider_id,
    v_tab_status,
    CASE WHEN v_tab_status = 'closed' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_tab_id;

  INSERT INTO public.client_tab_lines (
    tab_id, company_id, line_type, service_id, description,
    quantity, unit_price, line_total, seller_type, seller_provider_id, sort_order
  )
  VALUES (
    v_tab_id,
    v_appt.company_id,
    'service',
    v_appt.service_id,
    v_desc,
    1,
    v_unit_price,
    v_unit_price,
    CASE WHEN v_appt.provider_id IS NOT NULL THEN 'provider' ELSE 'admin' END,
    v_appt.provider_id,
    0
  );

  PERFORM public.recalculate_client_tab_totals(v_tab_id);
  RETURN v_tab_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_client_tab_for_appointment — VOLATILE (pode criar comanda)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_tab_for_appointment(p_appointment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tab public.client_tabs%ROWTYPE;
  v_lines json;
  v_pkg public.client_packages%ROWTYPE;
  v_remaining int;
  v_pending_payment boolean := false;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF NOT public.user_can_access_company_appointment(v_appt.company_id, v_appt.provider_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_tab FROM public.client_tabs WHERE appointment_id = p_appointment_id;
  IF NOT FOUND THEN
    PERFORM public.create_client_tab_for_appointment(p_appointment_id);
    SELECT * INTO v_tab FROM public.client_tabs WHERE appointment_id = p_appointment_id;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_encontrada');
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.sort_order, x.created_at), '[]'::json)
  INTO v_lines
  FROM (
    SELECT
      l.id,
      l.line_type,
      l.service_id,
      l.description,
      l.quantity,
      l.unit_price,
      l.line_total,
      l.seller_type,
      l.seller_provider_id,
      l.sort_order,
      l.created_at
    FROM public.client_tab_lines l
    WHERE l.tab_id = v_tab.id
  ) x;

  v_remaining := NULL;
  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND THEN
      v_remaining := GREATEST(v_pkg.total_sessions - v_pkg.used_sessions, 0);
      v_pending_payment := (v_pkg.status = 'pending_payment');
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'tab', json_build_object(
      'id', v_tab.id,
      'company_id', v_tab.company_id,
      'appointment_id', v_tab.appointment_id,
      'client_id', v_tab.client_id,
      'provider_id', v_tab.provider_id,
      'status', v_tab.status,
      'subtotal', v_tab.subtotal,
      'total', v_tab.total,
      'payment_method', v_tab.payment_method,
      'closed_at', v_tab.closed_at
    ),
    'lines', v_lines,
    'appointment', json_build_object(
      'id', v_appt.id,
      'status', v_appt.status,
      'appointment_date', v_appt.appointment_date,
      'appointment_time', to_char(v_appt.appointment_time, 'HH24:MI'),
      'client_package_id', v_appt.client_package_id,
      'package_session_number', v_appt.package_session_number
    ),
    'client', (
      SELECT json_build_object(
        'id', c.id,
        'name', c.name,
        'whatsapp', c.whatsapp
      )
      FROM public.clients c WHERE c.id = v_appt.client_id
    ),
    'package_remaining', v_remaining,
    'package_pending_payment', v_pending_payment
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- close_client_tab — reconcilia agendamento já completed + consome sessão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_client_tab(
  p_company_id uuid,
  p_tab_id uuid,
  p_payment_method text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tab public.client_tabs%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_pkg public.client_packages%ROWTYPE;
  v_consume json;
  v_remaining int;
  v_reconciled boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_tab_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN (
    'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forma_pagamento_invalida');
  END IF;

  SELECT * INTO v_tab
  FROM public.client_tabs t
  WHERE t.id = p_tab_id AND t.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_encontrada');
  END IF;

  IF v_tab.status = 'closed' THEN
    RETURN json_build_object('ok', true, 'tab_id', v_tab.id, 'already_closed', true);
  END IF;

  IF v_tab.status <> 'open' THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_aberta');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments a
  WHERE a.id = v_tab.appointment_id
  FOR UPDATE;

  IF v_appt.status IN ('cancelled', 'no_show') THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_cancelado');
  END IF;

  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND AND v_pkg.status = 'pending_payment' THEN
      RETURN json_build_object(
        'ok', false,
        'error', 'aguardando_pagamento_salao',
        'message', 'Confirme o pagamento do pacote antes de fechar a comanda.'
      );
    END IF;
  END IF;

  IF v_appt.status = 'completed' THEN
    v_reconciled := true;
  END IF;

  IF v_appt.client_package_id IS NOT NULL AND v_appt.package_session_number IS NULL THEN
    v_consume := public.consume_client_package_session(v_appt.id);
    IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN json_build_object(
        'ok', false,
        'error', COALESCE(v_consume->>'error', 'pacote_invalido')
      );
    END IF;
  END IF;

  IF v_appt.status <> 'completed' THEN
    UPDATE public.appointments SET
      status = 'completed',
      updated_at = now()
    WHERE id = v_appt.id;
  END IF;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);

  UPDATE public.client_tabs SET
    status = 'closed',
    payment_method = p_payment_method,
    closed_at = now(),
    closed_by = auth.uid(),
    updated_at = now()
  WHERE id = v_tab.id;

  v_remaining := NULL;
  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND THEN
      v_remaining := GREATEST(v_pkg.total_sessions - v_pkg.used_sessions, 0);
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'tab_id', v_tab.id,
    'appointment_id', v_appt.id,
    'total', (SELECT total FROM public.client_tabs WHERE id = v_tab.id),
    'package_remaining', v_remaining,
    'reconciled', v_reconciled,
    'message', CASE
      WHEN v_remaining IS NOT NULL THEN
        'Atendimento concluído. Restam ' || v_remaining::text || ' sessão(ões) do pacote.'
      WHEN v_reconciled THEN
        'Comanda sincronizada — atendimento já estava concluído.'
      ELSE
        'Atendimento concluído.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- list_client_tabs_for_date — não listar open inconsistente com agendamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_client_tabs_for_date(p_company_id uuid, p_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF p_company_id IS NULL OR p_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'tabs', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.appointment_time, x.client_name)
      FROM (
        SELECT
          t.id,
          t.status,
          t.subtotal,
          t.total,
          t.payment_method,
          t.closed_at,
          a.id AS appointment_id,
          a.status AS appointment_status,
          to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
          a.client_package_id,
          c.name AS client_name,
          c.whatsapp AS client_whatsapp,
          s.name AS service_name,
          sp.display_name AS provider_name
        FROM public.client_tabs t
        JOIN public.appointments a ON a.id = t.appointment_id
        JOIN public.clients c ON c.id = t.client_id
        JOIN public.services s ON s.id = a.service_id
        LEFT JOIN public.service_providers sp ON sp.id = t.provider_id
        WHERE t.company_id = p_company_id
          AND a.appointment_date = p_date
          AND NOT (t.status = 'open' AND a.status IN ('completed', 'cancelled', 'no_show'))
          AND (
            public.is_platform_admin()
            OR public.user_can_close_client_tab(p_company_id)
            OR (
              public.current_user_provider_id_for_company(p_company_id) IS NOT NULL
              AND t.provider_id = public.current_user_provider_id_for_company(p_company_id)
            )
          )
      ) x
    ), '[]'::json)
  );
END;
$$;

-- Consumir sessões de pacote pendentes (agendamento completed via Concluir legado)
DO $$
DECLARE
  r record;
  v_consume json;
BEGIN
  FOR r IN
    SELECT a.id AS appointment_id
    FROM public.appointments a
    JOIN public.client_tabs t ON t.appointment_id = a.id
    WHERE t.status = 'open'
      AND a.status = 'completed'
      AND a.client_package_id IS NOT NULL
      AND a.package_session_number IS NULL
  LOOP
    v_consume := public.consume_client_package_session(r.appointment_id);
  END LOOP;
END;
$$;

-- Reparar dados existentes
UPDATE public.client_tabs t
SET
  status = 'closed',
  closed_at = COALESCE(t.closed_at, now()),
  payment_method = COALESCE(t.payment_method, 'outro'),
  updated_at = now()
FROM public.appointments a
WHERE a.id = t.appointment_id
  AND t.status = 'open'
  AND a.status = 'completed';

UPDATE public.client_tabs t
SET status = 'cancelled', updated_at = now()
FROM public.appointments a
WHERE a.id = t.appointment_id
  AND t.status = 'open'
  AND a.status IN ('cancelled', 'no_show');

NOTIFY pgrst, 'reload schema';
