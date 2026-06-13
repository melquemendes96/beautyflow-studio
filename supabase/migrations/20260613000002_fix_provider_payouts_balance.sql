-- Corrige repasses: saldo sem dependência de migration 120, anti-duplicidade e overlap de período.

CREATE OR REPLACE FUNCTION public.provider_commission_balance(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_start date := COALESCE(p_start_date, date_trunc('month', current_date)::date);
  v_end date := COALESCE(p_end_date, current_date);
  v_service numeric := 0;
  v_product numeric := 0;
  v_paid numeric := 0;
  v_pending numeric := 0;
  v_reserved numeric := 0;
BEGIN
  IF p_company_id IS NULL OR p_provider_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF v_start > v_end THEN
    RETURN json_build_object('ok', false, 'error', 'periodo_invalido');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR p_provider_id = public.current_user_provider_id_for_company(p_company_id)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Comissão de serviços: base gravada na comanda fechada × % do prestador
  SELECT COALESCE(sum(
    round(t.commission_base * COALESCE(sp.default_commission_pct, 0) / 100.0, 2)
  ), 0)
  INTO v_service
  FROM public.client_tabs t
  JOIN public.appointments a ON a.id = t.appointment_id
  JOIN public.service_providers sp ON sp.id = t.provider_id
  WHERE t.company_id = p_company_id
    AND t.provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.status = 'completed'
    AND a.appointment_date BETWEEN v_start AND v_end;

  -- Comissão de produtos vendidos pelo prestador na comanda
  SELECT COALESCE(sum(
    public.product_line_commission(l.line_total, p.commission_pct, l.seller_provider_id)
  ), 0)
  INTO v_product
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  LEFT JOIN public.products p ON p.id = l.product_id
  JOIN public.appointments a ON a.id = t.appointment_id
  WHERE t.company_id = p_company_id
    AND l.line_type = 'product'
    AND l.seller_provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.appointment_date BETWEEN v_start AND v_end;

  -- Repasses já pagos (período sobreposto ao filtro)
  SELECT COALESCE(sum(pp.amount), 0)
  INTO v_paid
  FROM public.provider_payouts pp
  WHERE pp.company_id = p_company_id
    AND pp.provider_id = p_provider_id
    AND pp.status = 'paid'
    AND pp.period_start <= v_end
    AND pp.period_end >= v_start;

  -- Repasses pendentes (reservam saldo — evita gerar 2×)
  SELECT COALESCE(sum(pp.amount), 0)
  INTO v_pending
  FROM public.provider_payouts pp
  WHERE pp.company_id = p_company_id
    AND pp.provider_id = p_provider_id
    AND pp.status = 'pending'
    AND pp.period_start <= v_end
    AND pp.period_end >= v_start;

  v_reserved := v_paid + v_pending;

  RETURN json_build_object(
    'ok', true,
    'service_commission', round(v_service, 2),
    'product_commission', round(v_product, 2),
    'total_commission', round(v_service + v_product, 2),
    'paid', round(v_paid, 2),
    'pending', round(v_pending, 2),
    'balance', round(v_service + v_product - v_reserved, 2),
    'start_date', v_start,
    'end_date', v_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date,
  p_end_date date,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bal json;
  v_id uuid;
  v_pending_exists boolean;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN json_build_object('ok', false, 'error', 'periodo_invalido');
  END IF;

  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.provider_payouts pp
    WHERE pp.company_id = p_company_id
      AND pp.provider_id = p_provider_id
      AND pp.status = 'pending'
  )
  INTO v_pending_exists;

  IF v_pending_exists THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'repasse_pendente_existente',
      'message', 'Já existe um repasse pendente para este prestador. Marque como pago ou cancele antes de gerar outro.'
    );
  END IF;

  v_bal := public.provider_commission_balance(p_company_id, p_provider_id, p_start_date, p_end_date);
  IF NOT COALESCE((v_bal->>'ok')::boolean, false) THEN
    RETURN v_bal;
  END IF;

  IF COALESCE((v_bal->>'balance')::numeric, 0) <= 0 THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'saldo_zero',
      'message', 'Não há saldo de comissão disponível neste período.'
    );
  END IF;

  INSERT INTO public.provider_payouts (
    company_id, provider_id, amount,
    service_commission, product_commission,
    period_start, period_end, notes
  )
  VALUES (
    p_company_id,
    p_provider_id,
    (v_bal->>'balance')::numeric,
    (v_bal->>'service_commission')::numeric,
    (v_bal->>'product_commission')::numeric,
    p_start_date,
    p_end_date,
    p_notes
  )
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'ok', true,
    'payout_id', v_id,
    'amount', (v_bal->>'balance')::numeric
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_provider_payouts(
  p_company_id uuid,
  p_provider_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR (
      p_provider_id IS NOT NULL
      AND p_provider_id = public.current_user_provider_id_for_company(p_company_id)
    )
    OR (
      p_provider_id IS NULL
      AND p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'payouts', COALESCE((
      SELECT json_agg(json_build_object(
        'id', pp.id,
        'provider_id', pp.provider_id,
        'provider_name', sp.display_name,
        'amount', pp.amount,
        'service_commission', pp.service_commission,
        'product_commission', pp.product_commission,
        'period_start', pp.period_start,
        'period_end', pp.period_end,
        'status', pp.status,
        'payment_method', pp.payment_method,
        'paid_at', pp.paid_at,
        'notes', pp.notes
      ) ORDER BY pp.created_at DESC)
      FROM public.provider_payouts pp
      JOIN public.service_providers sp ON sp.id = pp.provider_id
      WHERE pp.company_id = p_company_id
        AND (p_provider_id IS NULL OR pp.provider_id = p_provider_id)
        AND (
          public.is_platform_admin()
          OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
          OR pp.provider_id = public.current_user_provider_id_for_company(p_company_id)
        )
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_provider_payout(
  p_company_id uuid,
  p_payout_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.provider_payouts SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = p_payout_id
    AND company_id = p_company_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'repasse_nao_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_provider_payout(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_provider_payout(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
