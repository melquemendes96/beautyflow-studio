-- Fix: get_client_tab_for_appointment — ORDER BY exige sort_order/created_at no subselect.

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

NOTIFY pgrst, 'reload schema';
