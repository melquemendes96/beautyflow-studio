-- Caixa profissional: fundo na abertura, caixa obrigatório para comanda, batimento com diferença.

ALTER TABLE public.cash_register_sessions
  ADD COLUMN IF NOT EXISTS opening_float numeric(12, 2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  ADD COLUMN IF NOT EXISTS total_variance numeric(12, 2);

ALTER TABLE public.cash_register_counts
  ADD COLUMN IF NOT EXISTS variance numeric(12, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_cash_register_status(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_session public.cash_register_sessions%ROWTYPE;
  v_expected json;
  v_sales_dinheiro numeric := 0;
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_session
  FROM public.cash_register_sessions s
  WHERE s.company_id = p_company_id AND s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', true, 'session', NULL);
  END IF;

  SELECT COALESCE(
    json_object_agg(sub.method, sub.total),
    '{}'::json
  )
  INTO v_expected
  FROM (
    SELECT
      COALESCE(t.payment_method, 'outro') AS method,
      COALESCE(sum(t.total), 0)::numeric AS total
    FROM public.client_tabs t
    WHERE t.company_id = p_company_id
      AND t.status = 'closed'
      AND t.cash_session_id = v_session.id
    GROUP BY COALESCE(t.payment_method, 'outro')
  ) sub;

  SELECT COALESCE(sum(t.total), 0) INTO v_sales_dinheiro
  FROM public.client_tabs t
  WHERE t.company_id = p_company_id
    AND t.status = 'closed'
    AND t.cash_session_id = v_session.id
    AND COALESCE(t.payment_method, 'outro') = 'dinheiro';

  RETURN json_build_object(
    'ok', true,
    'session', json_build_object(
      'id', v_session.id,
      'opened_at', v_session.opened_at,
      'status', v_session.status,
      'opening_float', COALESCE(v_session.opening_float, 0),
      'expected_by_method', v_expected,
      'sales_dinheiro', v_sales_dinheiro,
      'expected_dinheiro_total', COALESCE(v_session.opening_float, 0) + v_sales_dinheiro,
      'closed_tabs', (
        SELECT count(*)::int FROM public.client_tabs t
        WHERE t.cash_session_id = v_session.id AND t.status = 'closed'
      )
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.open_cash_register_session(uuid);

CREATE OR REPLACE FUNCTION public.open_cash_register_session(
  p_company_id uuid,
  p_opening_float numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
  v_float numeric := GREATEST(COALESCE(p_opening_float, 0), 0);
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_register_sessions s
    WHERE s.company_id = p_company_id AND s.status = 'open'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'caixa_ja_aberto');
  END IF;

  INSERT INTO public.cash_register_sessions (company_id, opened_by, status, opening_float)
  VALUES (p_company_id, auth.uid(), 'open', v_float)
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'session_id', v_id, 'opening_float', v_float);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_register_session(
  p_company_id uuid,
  p_session_id uuid,
  p_counts jsonb,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session public.cash_register_sessions%ROWTYPE;
  v_item jsonb;
  v_method text;
  v_counted numeric;
  v_expected numeric;
  v_variance numeric;
  v_total_variance numeric := 0;
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_session
  FROM public.cash_register_sessions s
  WHERE s.id = p_session_id AND s.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'open' THEN
    RETURN json_build_object('ok', false, 'error', 'sessao_invalida');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb))
  LOOP
    v_method := v_item->>'payment_method';
    v_counted := COALESCE((v_item->>'counted_amount')::numeric, 0);

    SELECT COALESCE(sum(t.total), 0) INTO v_expected
    FROM public.client_tabs t
    WHERE t.cash_session_id = v_session.id
      AND t.status = 'closed'
      AND COALESCE(t.payment_method, 'outro') = v_method;

    IF v_method = 'dinheiro' THEN
      v_expected := COALESCE(v_session.opening_float, 0) + v_expected;
    END IF;

    v_variance := round(v_counted - v_expected, 2);
    v_total_variance := v_total_variance + v_variance;

    INSERT INTO public.cash_register_counts (
      session_id, payment_method, expected_amount, counted_amount, variance
    )
    VALUES (v_session.id, v_method, v_expected, v_counted, v_variance)
    ON CONFLICT (session_id, payment_method) DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      counted_amount = EXCLUDED.counted_amount,
      variance = EXCLUDED.variance;
  END LOOP;

  UPDATE public.cash_register_sessions SET
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    notes = p_notes,
    total_variance = round(v_total_variance, 2),
    updated_at = now()
  WHERE id = v_session.id;

  RETURN json_build_object(
    'ok', true,
    'session_id', v_session.id,
    'total_variance', round(v_total_variance, 2)
  );
END;
$$;

-- close_client_tab — exige caixa aberto
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

  IF NOT EXISTS (
    SELECT 1 FROM public.cash_register_sessions s
    WHERE s.company_id = p_company_id AND s.status = 'open'
  ) THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'caixa_fechado',
      'message', 'Abra o caixa do dia antes de fechar comandas.'
    );
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

REVOKE ALL ON FUNCTION public.open_cash_register_session(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cash_register_session(uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
