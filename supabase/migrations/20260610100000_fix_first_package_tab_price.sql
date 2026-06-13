-- 1ª sessão de pacote: comanda com valor cheio (cobrança + comissão). Sessões 2+ permanecem R$ 0.

CREATE OR REPLACE FUNCTION public.package_tab_unit_price(
  p_client_package_id uuid,
  p_service_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pkg public.client_packages%ROWTYPE;
BEGIN
  IF p_client_package_id IS NULL THEN
    RETURN COALESCE(p_service_price, 0);
  END IF;

  SELECT * INTO v_pkg FROM public.client_packages WHERE id = p_client_package_id;
  IF NOT FOUND THEN
    RETURN COALESCE(p_service_price, 0);
  END IF;

  IF v_pkg.status = 'pending_payment' OR COALESCE(v_pkg.used_sessions, 0) = 0 THEN
    RETURN COALESCE(p_service_price, 0);
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_client_tab_package_pricing(p_tab_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tab public.client_tabs%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_svc public.services%ROWTYPE;
  v_pkg public.client_packages%ROWTYPE;
  v_unit_price numeric(12, 2);
  v_desc text;
BEGIN
  IF p_tab_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_tab FROM public.client_tabs WHERE id = p_tab_id;
  IF NOT FOUND OR v_tab.status <> 'open' THEN
    RETURN;
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_tab.appointment_id;
  IF NOT FOUND OR v_appt.client_package_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = v_appt.service_id;
  SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;

  v_unit_price := public.package_tab_unit_price(v_appt.client_package_id, v_svc.price);

  v_desc := COALESCE(v_svc.name, 'Serviço') || ' (pacote · sessão)';
  IF v_pkg.id IS NOT NULL THEN
    v_desc := COALESCE(v_svc.name, 'Serviço')
      || ' (pacote · '
      || (GREATEST(v_pkg.used_sessions, 0) + 1)::text || '/' || v_pkg.total_sessions::text
      || ')';
    IF v_pkg.status = 'pending_payment' OR v_pkg.used_sessions = 0 THEN
      v_desc := v_desc || ' · pagamento do pacote';
    END IF;
  END IF;

  UPDATE public.client_tab_lines l SET
    description = v_desc,
    unit_price = v_unit_price,
    line_total = v_unit_price
  WHERE l.tab_id = v_tab.id
    AND l.line_type = 'service'
    AND l.service_id = v_appt.service_id;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);
END;
$$;

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
    PERFORM public.sync_client_tab_package_pricing(v_tab_id);
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
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    v_unit_price := public.package_tab_unit_price(v_appt.client_package_id, v_svc.price);
    v_desc := COALESCE(v_svc.name, 'Serviço')
      || ' (pacote · '
      || (GREATEST(COALESCE(v_pkg.used_sessions, 0), 0) + 1)::text || '/' || v_pkg.total_sessions::text
      || ')';
    IF v_pkg.status = 'pending_payment' OR COALESCE(v_pkg.used_sessions, 0) = 0 THEN
      v_desc := v_desc || ' · pagamento do pacote';
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

-- Corrigir comandas abertas já criadas com R$ 0 na 1ª sessão
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.id AS tab_id
    FROM public.client_tabs t
    JOIN public.appointments a ON a.id = t.appointment_id
    JOIN public.client_packages cp ON cp.id = a.client_package_id
    WHERE t.status = 'open'
      AND a.client_package_id IS NOT NULL
      AND (cp.status = 'pending_payment' OR cp.used_sessions = 0)
  LOOP
    PERFORM public.sync_client_tab_package_pricing(r.tab_id);
  END LOOP;
END;
$$;

-- get_client_tab_for_appointment — sincroniza preço ao abrir comanda
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

  IF v_tab.status = 'open' AND v_appt.client_package_id IS NOT NULL THEN
    PERFORM public.sync_client_tab_package_pricing(v_tab.id);
    SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;
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

NOTIFY pgrst, 'reload schema';
