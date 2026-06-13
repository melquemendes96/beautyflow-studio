-- Fase 2: pacote pending_payment resolvido no fechamento da comanda + comissão 1ª sessão.

ALTER TABLE public.client_tabs
  ADD COLUMN IF NOT EXISTS commission_base numeric(12, 2) NOT NULL DEFAULT 0 CHECK (commission_base >= 0);

COMMENT ON COLUMN public.client_tabs.commission_base IS
  'Base de comissão do prestador neste atendimento (pacote: preço cheio só na 1ª sessão).';

-- ---------------------------------------------------------------------------
-- close_client_tab — resolução de pacote + comissão atômica
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_client_tab(
  p_company_id uuid,
  p_tab_id uuid,
  p_payment_method text,
  p_package_resolution text DEFAULT NULL
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
  v_consume json;
  v_remaining int;
  v_reconciled boolean := false;
  v_commission_base numeric(12, 2) := 0;
  v_session_num int;
  v_resolution text;
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
        UPDATE public.appointments SET
          client_package_id = NULL,
          package_session_number = NULL,
          updated_at = now()
        WHERE id = v_appt.id;

        UPDATE public.client_packages SET
          status = 'cancelled',
          updated_at = now()
        WHERE id = v_pkg.id;

        SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;

        IF v_svc.id IS NOT NULL THEN
          UPDATE public.client_tab_lines l SET
            unit_price = COALESCE(v_svc.price, 0),
            line_total = COALESCE(v_svc.price, 0)
          WHERE l.tab_id = v_tab.id
            AND l.line_type = 'service'
            AND l.service_id = v_svc.id;

          PERFORM public.recalculate_client_tab_totals(v_tab.id);
          SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;
        END IF;
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

-- Backfill commission_base em comandas já fechadas
UPDATE public.client_tabs t
SET commission_base = CASE
  WHEN a.client_package_id IS NOT NULL AND COALESCE(a.package_session_number, 0) = 1 THEN COALESCE(s.price, 0)
  WHEN a.client_package_id IS NOT NULL THEN 0
  ELSE COALESCE(t.total, s.price, 0)
END
FROM public.appointments a
JOIN public.services s ON s.id = a.service_id
WHERE t.appointment_id = a.id
  AND t.status = 'closed'
  AND t.commission_base = 0;

-- ---------------------------------------------------------------------------
-- Dashboard de comissão — usa commission_base da comanda fechada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_commission_dashboard(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_provider_id uuid;
  v_provider public.service_providers%ROWTYPE;
  v_pct numeric;
  v_today date := current_date;
  v_week_start date;
  v_month_start date;
  v_periods json;
  v_today_revenue numeric := 0;
  v_today_cnt int := 0;
  v_week_revenue numeric := 0;
  v_week_cnt int := 0;
  v_month_revenue numeric := 0;
  v_month_cnt int := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'company_id_required');
  END IF;

  v_provider_id := public.current_user_provider_id_for_company(p_company_id);

  IF v_provider_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_a_provider');
  END IF;

  SELECT * INTO v_provider
  FROM public.service_providers sp
  WHERE sp.id = v_provider_id AND sp.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_nao_encontrado');
  END IF;

  v_pct := COALESCE(v_provider.default_commission_pct, 0);
  v_week_start := date_trunc('week', v_today)::date;
  v_month_start := date_trunc('month', v_today)::date;

  SELECT
    COALESCE(sum(public.appointment_commission_base(a.id)), 0),
    count(*)::int
  INTO v_today_revenue, v_today_cnt
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.status = 'completed'
    AND a.appointment_date = v_today;

  SELECT
    COALESCE(sum(public.appointment_commission_base(a.id)), 0),
    count(*)::int
  INTO v_week_revenue, v_week_cnt
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.status = 'completed'
    AND a.appointment_date >= v_week_start
    AND a.appointment_date <= v_today;

  SELECT
    COALESCE(sum(public.appointment_commission_base(a.id)), 0),
    count(*)::int
  INTO v_month_revenue, v_month_cnt
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.status = 'completed'
    AND a.appointment_date >= v_month_start
    AND a.appointment_date <= v_today;

  WITH period_rows AS (
    SELECT 'week'::text AS kind, gs.i AS ord,
      (date_trunc('week', v_today)::date - (gs.i * interval '7 days'))::date AS start_date,
      LEAST(((date_trunc('week', v_today)::date - (gs.i * interval '7 days')) + interval '6 days')::date, v_today) AS end_date
    FROM generate_series(0, 7) AS gs(i)
    UNION ALL
    SELECT 'biweek'::text, gs.i,
      (v_today - (gs.i * 14) - 13)::date,
      LEAST((v_today - (gs.i * 14))::date, v_today)
    FROM generate_series(0, 5) AS gs(i)
    UNION ALL
    SELECT 'month'::text, gs.i,
      (date_trunc('month', v_today)::date - (gs.i || ' months')::interval)::date,
      LEAST(((date_trunc('month', v_today)::date - (gs.i || ' months')::interval) + interval '1 month - 1 day')::date, v_today)
    FROM generate_series(0, 5) AS gs(i)
  ),
  period_stats AS (
    SELECT
      pr.kind,
      pr.start_date,
      pr.end_date,
      pr.ord,
      COALESCE(sum(public.appointment_commission_base(a.id)), 0) AS revenue,
      count(a.id)::int AS appointments
    FROM period_rows pr
    LEFT JOIN public.appointments a
      ON a.company_id = p_company_id
     AND a.provider_id = v_provider_id
     AND a.status = 'completed'
     AND a.appointment_date >= pr.start_date
     AND a.appointment_date <= pr.end_date
    GROUP BY pr.kind, pr.start_date, pr.end_date, pr.ord
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'kind', ps.kind,
        'start_date', ps.start_date,
        'end_date', ps.end_date,
        'revenue', ps.revenue,
        'commission', round((ps.revenue * v_pct / 100.0)::numeric, 2),
        'appointments', ps.appointments
      )
      ORDER BY ps.kind, ps.ord DESC
    ),
    '[]'::json
  )
  INTO v_periods
  FROM period_stats ps;

  RETURN json_build_object(
    'ok', true,
    'provider_id', v_provider_id,
    'display_name', v_provider.display_name,
    'commission_pct', v_pct,
    'summary', json_build_object(
      'today_revenue', v_today_revenue,
      'today_commission', round((v_today_revenue * v_pct / 100.0)::numeric, 2),
      'today_appointments', v_today_cnt,
      'week_revenue', v_week_revenue,
      'week_commission', round((v_week_revenue * v_pct / 100.0)::numeric, 2),
      'week_appointments', v_week_cnt,
      'month_revenue', v_month_revenue,
      'month_commission', round((v_month_revenue * v_pct / 100.0)::numeric, 2),
      'month_appointments', v_month_cnt
    ),
    'periods', v_periods
  );
END;
$$;

-- Helper STABLE para base de comissão por agendamento
CREATE OR REPLACE FUNCTION public.appointment_commission_base(p_appointment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT t.commission_base
      FROM public.client_tabs t
      WHERE t.appointment_id = p_appointment_id
        AND t.status = 'closed'
      LIMIT 1
    ),
    (
      SELECT CASE
        WHEN a.client_package_id IS NOT NULL AND COALESCE(a.package_session_number, 0) > 1 THEN 0::numeric
        WHEN a.client_package_id IS NOT NULL AND a.package_session_number = 1 THEN COALESCE(s.price, 0)
        WHEN a.client_package_id IS NULL THEN COALESCE(s.price, 0)
        ELSE 0::numeric
      END
      FROM public.appointments a
      JOIN public.services s ON s.id = a.service_id
      WHERE a.id = p_appointment_id
    ),
    0::numeric
  );
$$;

REVOKE ALL ON FUNCTION public.appointment_commission_base(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appointment_commission_base(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
