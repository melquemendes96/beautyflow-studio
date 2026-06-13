-- Comandas Fases 3–5 (parte 2): close_client_tab + get_tab + comissão produtos + grants.

-- get_client_tab_for_appointment — incluir product_id nas linhas
CREATE OR REPLACE FUNCTION public.get_client_tab_for_appointment(p_appointment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
VOLATILE
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

  SELECT * INTO v_appt FROM public.appointments a WHERE a.id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR v_appt.company_id IN (SELECT public.current_user_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  PERFORM public.create_client_tab_for_appointment(v_appt.id);

  SELECT * INTO v_tab FROM public.client_tabs t WHERE t.appointment_id = p_appointment_id;

  IF v_tab.status = 'open' AND v_appt.client_package_id IS NOT NULL THEN
    PERFORM public.sync_client_tab_package_pricing(v_tab.id);
    SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'id', x.id,
      'line_type', x.line_type,
      'service_id', x.service_id,
      'product_id', x.product_id,
      'description', x.description,
      'quantity', x.quantity,
      'unit_price', x.unit_price,
      'line_total', x.line_total,
      'seller_type', x.seller_type,
      'seller_provider_id', x.seller_provider_id
    )
    ORDER BY x.sort_order, x.created_at
  ), '[]'::json)
  INTO v_lines
  FROM (
    SELECT
      l.id, l.line_type, l.service_id, l.product_id, l.description,
      l.quantity, l.unit_price, l.line_total, l.seller_type, l.seller_provider_id,
      l.sort_order, l.created_at
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
      'closed_at', v_tab.closed_at,
      'product_sales_total', COALESCE(v_tab.product_sales_total, 0),
      'product_commission_total', COALESCE(v_tab.product_commission_total, 0)
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
      SELECT json_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp)
      FROM public.clients c WHERE c.id = v_appt.client_id
    ),
    'package_remaining', v_remaining,
    'package_pending_payment', v_pending_payment,
    'inventory_enabled', public.company_has_inventory(v_tab.company_id)
  );
END;
$$;

-- close_client_tab — estoque, consumíveis, caixa, comissão produtos
CREATE OR REPLACE FUNCTION public.close_client_tab(
  p_company_id uuid,
  p_tab_id uuid,
  p_payment_method text,
  p_package_resolution text DEFAULT NULL,
  p_single_service_id uuid DEFAULT NULL
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
  v_svc public.services%ROWTYPE;
  v_single_svc public.services%ROWTYPE;
  v_consume json;
  v_inv json;
  v_product_totals json;
  v_remaining int;
  v_reconciled boolean := false;
  v_commission_base numeric(12, 2) := 0;
  v_service_total numeric(12, 2) := 0;
  v_session_num int;
  v_resolution text;
  v_lines_updated int;
  v_cash_session_id uuid;
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

  v_resolution := NULLIF(trim(lower(COALESCE(p_package_resolution, ''))), '');

  IF v_resolution IS NOT NULL AND v_resolution NOT IN ('confirm', 'avulso') THEN
    RETURN json_build_object('ok', false, 'error', 'resolucao_pacote_invalida');
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

  SELECT * INTO v_svc FROM public.services s WHERE s.id = v_appt.service_id;

  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id FOR UPDATE;

    IF FOUND AND v_pkg.status = 'pending_payment' THEN
      IF v_resolution IS NULL THEN
        RETURN json_build_object(
          'ok', false,
          'error', 'aguardando_pagamento_salao',
          'message', 'Escolha confirmar o pacote ou marcar como avulso antes de fechar.'
        );
      END IF;

      IF NOT public.user_can_confirm_client_package(p_company_id, v_pkg.provider_id) THEN
        RETURN json_build_object('ok', false, 'error', 'forbidden');
      END IF;

      IF v_resolution = 'confirm' THEN
        UPDATE public.client_packages SET
          status = 'active',
          paid_at = now(),
          payment_confirmed_at = now(),
          payment_confirmed_by = auth.uid(),
          updated_at = now()
        WHERE id = v_pkg.id;
        SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_pkg.id;
      ELSIF v_resolution = 'avulso' THEN
        IF p_single_service_id IS NULL THEN
          RETURN json_build_object(
            'ok', false,
            'error', 'servico_avulso_obrigatorio',
            'message', 'Selecione o serviço avulso que a cliente recebeu.'
          );
        END IF;

        SELECT * INTO v_single_svc
        FROM public.services s
        WHERE s.id = p_single_service_id
          AND s.company_id = p_company_id
          AND s.active = true;

        IF NOT FOUND THEN
          RETURN json_build_object('ok', false, 'error', 'servico_nao_encontrado');
        END IF;

        IF COALESCE(v_single_svc.service_kind, 'single') = 'package' THEN
          RETURN json_build_object('ok', false, 'error', 'servico_avulso_invalido');
        END IF;

        UPDATE public.client_packages SET status = 'cancelled', updated_at = now() WHERE id = v_pkg.id;

        UPDATE public.appointments SET
          client_package_id = NULL,
          package_session_number = NULL,
          service_id = v_single_svc.id,
          updated_at = now()
        WHERE id = v_appt.id;

        UPDATE public.client_tab_lines l SET
          service_id = v_single_svc.id,
          description = v_single_svc.name,
          unit_price = COALESCE(v_single_svc.price, 0),
          line_total = COALESCE(v_single_svc.price, 0)
        WHERE l.tab_id = v_tab.id AND l.line_type = 'service';

        GET DIAGNOSTICS v_lines_updated = ROW_COUNT;

        IF v_lines_updated = 0 THEN
          INSERT INTO public.client_tab_lines (
            tab_id, company_id, line_type, service_id, description,
            quantity, unit_price, line_total, seller_type, seller_provider_id, sort_order
          )
          VALUES (
            v_tab.id, v_tab.company_id, 'service', v_single_svc.id, v_single_svc.name,
            1, COALESCE(v_single_svc.price, 0), COALESCE(v_single_svc.price, 0),
            CASE WHEN v_tab.provider_id IS NOT NULL THEN 'provider' ELSE 'admin' END,
            v_tab.provider_id, 0
          );
        END IF;

        PERFORM public.recalculate_client_tab_totals(v_tab.id);
        SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;
        SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
        v_svc := v_single_svc;
      END IF;
    END IF;
  END IF;

  IF v_appt.status = 'completed' THEN
    v_reconciled := true;
  END IF;

  IF v_appt.client_package_id IS NOT NULL AND v_appt.package_session_number IS NULL THEN
    v_consume := public.consume_client_package_session(v_appt.id);
    IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN json_build_object('ok', false, 'error', COALESCE(v_consume->>'error', 'pacote_invalido'));
    END IF;
  END IF;

  IF v_appt.status <> 'completed' THEN
    UPDATE public.appointments SET status = 'completed', updated_at = now() WHERE id = v_appt.id;
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
  SELECT * INTO v_svc FROM public.services WHERE id = v_appt.service_id;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);
  SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;

  v_inv := public.finalize_tab_inventory(v_tab.id, p_company_id);
  IF NOT COALESCE((v_inv->>'ok')::boolean, false) THEN
    RETURN v_inv;
  END IF;

  v_product_totals := public.compute_tab_product_totals(v_tab.id);

  SELECT COALESCE(sum(l.line_total), 0) INTO v_service_total
  FROM public.client_tab_lines l
  WHERE l.tab_id = v_tab.id AND l.line_type IN ('service', 'service_extra');

  v_session_num := v_appt.package_session_number;

  IF v_appt.client_package_id IS NOT NULL THEN
    IF v_session_num = 1 THEN
      v_commission_base := COALESCE(v_svc.price, 0);
    ELSE
      v_commission_base := 0;
    END IF;
  ELSE
    v_commission_base := CASE
      WHEN v_service_total > 0 THEN v_service_total
      ELSE COALESCE(v_svc.price, 0)
    END;
  END IF;

  SELECT s.id INTO v_cash_session_id
  FROM public.cash_register_sessions s
  WHERE s.company_id = p_company_id AND s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  UPDATE public.client_tabs SET
    status = 'closed',
    payment_method = p_payment_method,
    commission_base = v_commission_base,
    product_sales_total = COALESCE((v_product_totals->>'product_sales')::numeric, 0),
    product_commission_total = COALESCE((v_product_totals->>'product_commission')::numeric, 0),
    cash_session_id = v_cash_session_id,
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
    'commission_base', v_commission_base,
    'product_sales', COALESCE((v_product_totals->>'product_sales')::numeric, 0),
    'product_commission', COALESCE((v_product_totals->>'product_commission')::numeric, 0),
    'package_remaining', v_remaining,
    'package_session_number', v_session_num,
    'reconciled', v_reconciled,
    'message', CASE
      WHEN v_remaining IS NOT NULL AND v_session_num = 1 THEN
        'Pacote confirmado e 1ª sessão concluída. Restam ' || v_remaining::text || ' sessão(ões).'
      WHEN v_remaining IS NOT NULL THEN
        'Atendimento concluído. Restam ' || v_remaining::text || ' sessão(ões) do pacote.'
      WHEN v_resolution = 'avulso' THEN
        'Atendimento avulso concluído — pacote cancelado.'
      WHEN v_reconciled THEN
        'Comanda sincronizada — atendimento já estava concluído.'
      ELSE
        'Atendimento concluído.'
    END
  );
END;
$$;

-- Comissão produtos no dashboard prestador (realizado)
CREATE OR REPLACE FUNCTION public.provider_product_commission_for_period(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date,
  p_end_date date,
  p_only_past boolean DEFAULT false
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(
    public.product_line_commission(l.line_total, p.commission_pct, l.seller_provider_id)
  ), 0)
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  LEFT JOIN public.products p ON p.id = l.product_id
  JOIN public.appointments a ON a.id = t.appointment_id
  WHERE t.company_id = p_company_id
    AND l.line_type = 'product'
    AND l.seller_provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.appointment_date BETWEEN p_start_date AND p_end_date
    AND (NOT p_only_past OR a.appointment_date < current_date);
$$;

-- Grants
REVOKE ALL ON FUNCTION public.company_has_inventory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_line_commission(numeric, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stock_movement(uuid, uuid, text, numeric, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_tab_product_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_tab_inventory(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_products(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_product(uuid, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_adjust_product_stock(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_client_tab_product_line(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_client_tab_line(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_service_consumables(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_service_consumable(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_service_consumable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cash_register_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_cash_register_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_register_session(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_commission_balance(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_provider_payout(uuid, uuid, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_provider_payouts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_provider_payout_paid(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_product_commission_for_period(uuid, uuid, date, date, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.company_has_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_products(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_product(uuid, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_product_stock(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_client_tab_product_line(uuid, uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_client_tab_line(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_service_consumables(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_service_consumable(uuid, uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_service_consumable(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_register_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_register_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_register_session(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_commission_balance(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_provider_payout(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_payouts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_payout_paid(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
