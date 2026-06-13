-- Avulso no fechamento: exige serviço avulso escolhido (não cobra preço do pacote).

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
  v_remaining int;
  v_reconciled boolean := false;
  v_commission_base numeric(12, 2) := 0;
  v_session_num int;
  v_resolution text;
  v_lines_updated int;
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

        UPDATE public.client_packages SET
          status = 'cancelled',
          updated_at = now()
        WHERE id = v_pkg.id;

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
        WHERE l.tab_id = v_tab.id
          AND l.line_type = 'service';

        GET DIAGNOSTICS v_lines_updated = ROW_COUNT;

        IF v_lines_updated = 0 THEN
          INSERT INTO public.client_tab_lines (
            tab_id, company_id, line_type, service_id, description,
            quantity, unit_price, line_total, seller_type, seller_provider_id, sort_order
          )
          VALUES (
            v_tab.id,
            v_tab.company_id,
            'service',
            v_single_svc.id,
            v_single_svc.name,
            1,
            COALESCE(v_single_svc.price, 0),
            COALESCE(v_single_svc.price, 0),
            CASE WHEN v_tab.provider_id IS NOT NULL THEN 'provider' ELSE 'admin' END,
            v_tab.provider_id,
            0
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

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
  SELECT * INTO v_svc FROM public.services WHERE id = v_appt.service_id;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);
  SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;

  v_session_num := v_appt.package_session_number;

  IF v_appt.client_package_id IS NOT NULL THEN
    IF v_session_num = 1 THEN
      v_commission_base := COALESCE(v_svc.price, 0);
    ELSE
      v_commission_base := 0;
    END IF;
  ELSE
    v_commission_base := COALESCE(v_tab.total, v_svc.price, 0);
  END IF;

  UPDATE public.client_tabs SET
    status = 'closed',
    payment_method = p_payment_method,
    commission_base = v_commission_base,
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

NOTIFY pgrst, 'reload schema';
