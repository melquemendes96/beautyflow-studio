-- =============================================================================
-- BeautyFlow — SQL completo: Calendario inteligente (Prestador / Admin / Master)
-- Aplicar no Supabase SQL Editor (uma vez).
--
-- PRE-REQUISITOS (se ainda nao aplicou as migrations de Comandas anteriores):
--   20260607000000_client_package_salon_payment.sql
--   20260608000000_fix_package_session_on_close.sql
--   20260609000000_client_tabs_foundation.sql
--   20260609100000_fix_client_tabs_sync.sql
--   20260609110000_fix_client_tab_lines_order.sql
--   20260610000000_client_tabs_phase2_package_close.sql
--
-- Este script inclui (em ordem):
--   101 fix_first_package_tab_price
--   102 close_tab_avulso_service_selection
--   110 provider_commission_calendar (prestador)
--   120 dashboard_calendar_admin_master (admin + master)
-- =============================================================================

-- >>> FILE: 20260610100000_fix_first_package_tab_price.sql
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

-- >>> FILE: 20260610200000_close_tab_avulso_service_selection.sql
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

-- >>> FILE: 20260611000000_provider_commission_calendar.sql
-- Dashboard prestador: comissão por intervalo de datas (passado realizado + futuro projetado).

CREATE OR REPLACE FUNCTION public.provider_commission_projected_base(p_appointment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.price, 0)
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.id = p_appointment_id
    AND a.status IN ('scheduled', 'confirmed');
$$;

CREATE OR REPLACE FUNCTION public.provider_commission_range(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
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
  v_start date;
  v_end date;
  v_realized_revenue numeric := 0;
  v_realized_commission numeric := 0;
  v_realized_appts int := 0;
  v_today_realized_revenue numeric := 0;
  v_today_realized_commission numeric := 0;
  v_today_realized_appts int := 0;
  v_today_upcoming_revenue numeric := 0;
  v_today_upcoming_commission numeric := 0;
  v_today_upcoming_appts int := 0;
  v_future_revenue numeric := 0;
  v_future_commission numeric := 0;
  v_future_appts int := 0;
  v_days json;
BEGIN
  IF p_company_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  v_start := LEAST(p_start_date, p_end_date);
  v_end := GREATEST(p_start_date, p_end_date);

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

  WITH days AS (
    SELECT gs.d::date AS day
    FROM generate_series(v_start, v_end, interval '1 day') AS gs(d)
  ),
  appt_by_day AS (
    SELECT
      d.day,
      a.id AS appointment_id,
      a.status,
      CASE
        WHEN a.status = 'completed' THEN public.appointment_commission_base(a.id)
        WHEN a.status IN ('scheduled', 'confirmed') THEN public.provider_commission_projected_base(a.id)
        ELSE 0::numeric
      END AS revenue_base
    FROM days d
    LEFT JOIN public.appointments a
      ON a.company_id = p_company_id
     AND a.provider_id = v_provider_id
     AND a.appointment_date = d.day
     AND a.status IN ('completed', 'scheduled', 'confirmed')
  ),
  day_agg AS (
    SELECT
      day,
      COALESCE(sum(CASE WHEN status = 'completed' THEN revenue_base END), 0) AS realized_revenue,
      count(*) FILTER (WHERE status = 'completed')::int AS realized_appointments,
      COALESCE(sum(CASE WHEN status IN ('scheduled', 'confirmed') THEN revenue_base END), 0) AS upcoming_revenue,
      count(*) FILTER (WHERE status IN ('scheduled', 'confirmed'))::int AS upcoming_appointments
    FROM appt_by_day
    WHERE appointment_id IS NOT NULL
    GROUP BY day
  ),
  all_days AS (
    SELECT
      d.day,
      COALESCE(da.realized_revenue, 0) AS realized_revenue,
      COALESCE(da.realized_appointments, 0) AS realized_appointments,
      COALESCE(da.upcoming_revenue, 0) AS upcoming_revenue,
      COALESCE(da.upcoming_appointments, 0) AS upcoming_appointments
    FROM days d
    LEFT JOIN day_agg da ON da.day = d.day
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'date', ad.day,
        'realized_revenue', ad.realized_revenue,
        'realized_commission', round((ad.realized_revenue * v_pct / 100.0)::numeric, 2),
        'realized_appointments', ad.realized_appointments,
        'upcoming_revenue', ad.upcoming_revenue,
        'upcoming_commission', round((ad.upcoming_revenue * v_pct / 100.0)::numeric, 2),
        'upcoming_appointments', ad.upcoming_appointments,
        'is_today', (ad.day = v_today),
        'is_past', (ad.day < v_today),
        'is_future', (ad.day > v_today)
      )
      ORDER BY ad.day
    ),
    '[]'::json
  )
  INTO v_days
  FROM all_days ad;

  SELECT
    COALESCE(sum(CASE WHEN a.status = 'completed' AND a.appointment_date < v_today THEN public.appointment_commission_base(a.id) END), 0),
    count(*) FILTER (WHERE a.status = 'completed' AND a.appointment_date < v_today)::int
  INTO v_realized_revenue, v_realized_appts
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.appointment_date BETWEEN v_start AND v_end
    AND a.appointment_date < v_today;

  SELECT
    COALESCE(sum(public.appointment_commission_base(a.id)), 0),
    count(*)::int
  INTO v_today_realized_revenue, v_today_realized_appts
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.appointment_date = v_today
    AND a.status = 'completed'
    AND v_today BETWEEN v_start AND v_end;

  SELECT
    COALESCE(sum(public.provider_commission_projected_base(a.id)), 0),
    count(*)::int
  INTO v_today_upcoming_revenue, v_today_upcoming_appts
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.appointment_date = v_today
    AND a.status IN ('scheduled', 'confirmed')
    AND v_today BETWEEN v_start AND v_end;

  v_today_realized_commission := round((v_today_realized_revenue * v_pct / 100.0)::numeric, 2);
  v_today_upcoming_commission := round((v_today_upcoming_revenue * v_pct / 100.0)::numeric, 2);

  SELECT
    COALESCE(sum(public.provider_commission_projected_base(a.id)), 0),
    count(*)::int
  INTO v_future_revenue, v_future_appts
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.appointment_date BETWEEN v_start AND v_end
    AND a.appointment_date > v_today
    AND a.status IN ('scheduled', 'confirmed');

  v_realized_commission := round((v_realized_revenue * v_pct / 100.0)::numeric, 2);
  v_future_commission := round((v_future_revenue * v_pct / 100.0)::numeric, 2);

  RETURN json_build_object(
    'ok', true,
    'commission_pct', v_pct,
    'start_date', v_start,
    'end_date', v_end,
    'today', v_today,
    'realized', json_build_object(
      'revenue', v_realized_revenue,
      'commission', v_realized_commission,
      'appointments', v_realized_appts,
      'product_sales', 0,
      'product_commission', 0
    ),
    'today_block', json_build_object(
      'realized_revenue', v_today_realized_revenue,
      'realized_commission', v_today_realized_commission,
      'realized_appointments', v_today_realized_appts,
      'upcoming_revenue', v_today_upcoming_revenue,
      'upcoming_commission', v_today_upcoming_commission,
      'upcoming_appointments', v_today_upcoming_appts
    ),
    'upcoming', json_build_object(
      'revenue', v_future_revenue,
      'commission', v_future_commission,
      'appointments', v_future_appts,
      'product_sales', 0,
      'product_commission', 0
    ),
    'days', v_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provider_commission_projected_base(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_commission_range(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_commission_projected_base(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_commission_range(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260612000000_dashboard_calendar_admin_master.sql
-- Dashboard admin (empresa) + master (SaaS): KPIs + intervalo inteligente (passado · hoje · futuro).

-- ---------------------------------------------------------------------------
-- Helpers de receita / comissão (empresa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_revenue_projected(p_appointment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.provider_commission_projected_base(p_appointment_id);
$$;

CREATE OR REPLACE FUNCTION public.appointment_revenue_realized(p_appointment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT t.total
      FROM public.client_tabs t
      WHERE t.appointment_id = p_appointment_id
        AND t.status = 'closed'
      LIMIT 1
    ),
    (
      SELECT public.appointment_commission_base(a.id)
      FROM public.appointments a
      WHERE a.id = p_appointment_id
        AND a.status = 'completed'
    ),
    0::numeric
  );
$$;

CREATE OR REPLACE FUNCTION public.appointment_provider_commission(p_appointment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN a.status = 'completed' THEN round(
      (public.appointment_commission_base(a.id) * COALESCE(sp.default_commission_pct, 0) / 100.0)::numeric,
      2
    )
    ELSE 0::numeric
  END
  FROM public.appointments a
  LEFT JOIN public.service_providers sp ON sp.id = a.provider_id
  WHERE a.id = p_appointment_id;
$$;

-- ---------------------------------------------------------------------------
-- company_dashboard_summary — KPIs fixos do painel admin (owner/admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_dashboard_summary(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_today date := current_date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_week_end date := (date_trunc('week', v_today) + interval '6 days')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_month_end date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_clients int := 0;
  v_today_appts int := 0;
  v_today_revenue numeric := 0;
  v_today_commissions numeric := 0;
  v_week_appts int := 0;
  v_week_revenue numeric := 0;
  v_week_commissions numeric := 0;
  v_month_appts int := 0;
  v_month_revenue numeric := 0;
  v_month_commissions numeric := 0;
  v_attendance int := 0;
  v_completed_30 int := 0;
  v_noshow_30 int := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;

  SELECT count(*)::int INTO v_clients
  FROM public.clients c
  WHERE c.company_id = p_company_id;

  SELECT
    count(*) FILTER (WHERE a.status IN ('scheduled', 'confirmed', 'completed'))::int,
    COALESCE(sum(CASE
      WHEN a.status = 'completed' THEN public.appointment_revenue_realized(a.id)
      WHEN a.status IN ('scheduled', 'confirmed') THEN public.appointment_revenue_projected(a.id)
      ELSE 0
    END), 0),
    COALESCE(sum(CASE WHEN a.status = 'completed' THEN public.appointment_provider_commission(a.id) END), 0)
  INTO v_today_appts, v_today_revenue, v_today_commissions
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date = v_today
    AND a.status IN ('scheduled', 'confirmed', 'completed', 'no_show');

  SELECT
    count(*) FILTER (WHERE a.status IN ('scheduled', 'confirmed', 'completed'))::int,
    COALESCE(sum(CASE
      WHEN a.status = 'completed' THEN public.appointment_revenue_realized(a.id)
      WHEN a.status IN ('scheduled', 'confirmed') THEN public.appointment_revenue_projected(a.id)
      ELSE 0
    END), 0),
    COALESCE(sum(CASE WHEN a.status = 'completed' THEN public.appointment_provider_commission(a.id) END), 0)
  INTO v_week_appts, v_week_revenue, v_week_commissions
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date BETWEEN v_week_start AND v_week_end
    AND a.status IN ('scheduled', 'confirmed', 'completed', 'no_show');

  SELECT
    count(*) FILTER (WHERE a.status IN ('scheduled', 'confirmed', 'completed'))::int,
    COALESCE(sum(CASE
      WHEN a.status = 'completed' THEN public.appointment_revenue_realized(a.id)
      WHEN a.status IN ('scheduled', 'confirmed') THEN public.appointment_revenue_projected(a.id)
      ELSE 0
    END), 0),
    COALESCE(sum(CASE WHEN a.status = 'completed' THEN public.appointment_provider_commission(a.id) END), 0)
  INTO v_month_appts, v_month_revenue, v_month_commissions
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date BETWEEN v_month_start AND v_month_end
    AND a.status IN ('scheduled', 'confirmed', 'completed', 'no_show');

  SELECT
    count(*) FILTER (WHERE a.status = 'completed')::int,
    count(*) FILTER (WHERE a.status = 'no_show')::int
  INTO v_completed_30, v_noshow_30
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date BETWEEN (v_today - 30) AND v_today;

  IF (v_completed_30 + v_noshow_30) > 0 THEN
    v_attendance := round((v_completed_30::numeric / (v_completed_30 + v_noshow_30)::numeric) * 100)::int;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'clients_count', v_clients,
    'summary', json_build_object(
      'today_appointments', v_today_appts,
      'today_revenue', round(v_today_revenue, 2),
      'today_commissions', round(v_today_commissions, 2),
      'week_appointments', v_week_appts,
      'week_revenue', round(v_week_revenue, 2),
      'week_commissions', round(v_week_commissions, 2),
      'month_appointments', v_month_appts,
      'month_revenue', round(v_month_revenue, 2),
      'month_commissions', round(v_month_commissions, 2),
      'attendance_rate_30d', v_attendance
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- company_dashboard_range — intervalo inteligente (admin empresa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_dashboard_range(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_today date := current_date;
  v_start date;
  v_end date;
  v_realized_revenue numeric := 0;
  v_realized_commissions numeric := 0;
  v_realized_appts int := 0;
  v_today_realized_revenue numeric := 0;
  v_today_realized_commissions numeric := 0;
  v_today_realized_appts int := 0;
  v_today_upcoming_revenue numeric := 0;
  v_today_upcoming_commissions numeric := 0;
  v_today_upcoming_appts int := 0;
  v_future_revenue numeric := 0;
  v_future_commissions numeric := 0;
  v_future_appts int := 0;
  v_days json;
BEGIN
  IF p_company_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;

  v_start := LEAST(p_start_date, p_end_date);
  v_end := GREATEST(p_start_date, p_end_date);

  WITH days AS (
    SELECT gs.d::date AS day
    FROM generate_series(v_start, v_end, interval '1 day') AS gs(d)
  ),
  appt_by_day AS (
    SELECT
      d.day,
      a.id AS appointment_id,
      a.status,
      CASE
        WHEN a.status = 'completed' THEN public.appointment_revenue_realized(a.id)
        WHEN a.status IN ('scheduled', 'confirmed') THEN public.appointment_revenue_projected(a.id)
        ELSE 0::numeric
      END AS revenue_base,
      CASE
        WHEN a.status = 'completed' THEN public.appointment_provider_commission(a.id)
        WHEN a.status IN ('scheduled', 'confirmed') THEN round(
          (public.appointment_revenue_projected(a.id) * COALESCE(sp.default_commission_pct, 0) / 100.0)::numeric,
          2
        )
        ELSE 0::numeric
      END AS commission_base
    FROM days d
    LEFT JOIN public.appointments a
      ON a.company_id = p_company_id
     AND a.appointment_date = d.day
     AND a.status IN ('completed', 'scheduled', 'confirmed')
    LEFT JOIN public.service_providers sp ON sp.id = a.provider_id
  ),
  day_agg AS (
    SELECT
      day,
      COALESCE(sum(CASE WHEN status = 'completed' THEN revenue_base END), 0) AS realized_revenue,
      COALESCE(sum(CASE WHEN status = 'completed' THEN commission_base END), 0) AS realized_commission,
      count(*) FILTER (WHERE status = 'completed')::int AS realized_appointments,
      COALESCE(sum(CASE WHEN status IN ('scheduled', 'confirmed') THEN revenue_base END), 0) AS upcoming_revenue,
      COALESCE(sum(CASE WHEN status IN ('scheduled', 'confirmed') THEN commission_base END), 0) AS upcoming_commission,
      count(*) FILTER (WHERE status IN ('scheduled', 'confirmed'))::int AS upcoming_appointments
    FROM appt_by_day
    WHERE appointment_id IS NOT NULL
    GROUP BY day
  ),
  all_days AS (
    SELECT
      d.day,
      COALESCE(da.realized_revenue, 0) AS realized_revenue,
      COALESCE(da.realized_commission, 0) AS realized_commission,
      COALESCE(da.realized_appointments, 0) AS realized_appointments,
      COALESCE(da.upcoming_revenue, 0) AS upcoming_revenue,
      COALESCE(da.upcoming_commission, 0) AS upcoming_commission,
      COALESCE(da.upcoming_appointments, 0) AS upcoming_appointments
    FROM days d
    LEFT JOIN day_agg da ON da.day = d.day
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'date', ad.day,
        'realized_revenue', ad.realized_revenue,
        'realized_commission', ad.realized_commission,
        'realized_appointments', ad.realized_appointments,
        'upcoming_revenue', ad.upcoming_revenue,
        'upcoming_commission', ad.upcoming_commission,
        'upcoming_appointments', ad.upcoming_appointments,
        'is_today', (ad.day = v_today),
        'is_past', (ad.day < v_today),
        'is_future', (ad.day > v_today)
      )
      ORDER BY ad.day
    ),
    '[]'::json
  )
  INTO v_days
  FROM all_days ad;

  SELECT
    COALESCE(sum(CASE WHEN a.status = 'completed' THEN public.appointment_revenue_realized(a.id) END), 0),
    COALESCE(sum(CASE WHEN a.status = 'completed' THEN public.appointment_provider_commission(a.id) END), 0),
    count(*) FILTER (WHERE a.status = 'completed')::int
  INTO v_realized_revenue, v_realized_commissions, v_realized_appts
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date BETWEEN v_start AND v_end
    AND a.appointment_date < v_today;

  SELECT
    COALESCE(sum(public.appointment_revenue_realized(a.id)), 0),
    COALESCE(sum(public.appointment_provider_commission(a.id)), 0),
    count(*)::int
  INTO v_today_realized_revenue, v_today_realized_commissions, v_today_realized_appts
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date = v_today
    AND a.status = 'completed'
    AND v_today BETWEEN v_start AND v_end;

  SELECT
    COALESCE(sum(public.appointment_revenue_projected(a.id)), 0),
    COALESCE(sum(round(
      (public.appointment_revenue_projected(a.id) * COALESCE(sp.default_commission_pct, 0) / 100.0)::numeric,
      2
    )), 0),
    count(*)::int
  INTO v_today_upcoming_revenue, v_today_upcoming_commissions, v_today_upcoming_appts
  FROM public.appointments a
  LEFT JOIN public.service_providers sp ON sp.id = a.provider_id
  WHERE a.company_id = p_company_id
    AND a.appointment_date = v_today
    AND a.status IN ('scheduled', 'confirmed')
    AND v_today BETWEEN v_start AND v_end;

  SELECT
    COALESCE(sum(public.appointment_revenue_projected(a.id)), 0),
    COALESCE(sum(round(
      (public.appointment_revenue_projected(a.id) * COALESCE(sp.default_commission_pct, 0) / 100.0)::numeric,
      2
    )), 0),
    count(*)::int
  INTO v_future_revenue, v_future_commissions, v_future_appts
  FROM public.appointments a
  LEFT JOIN public.service_providers sp ON sp.id = a.provider_id
  WHERE a.company_id = p_company_id
    AND a.appointment_date BETWEEN v_start AND v_end
    AND a.appointment_date > v_today
    AND a.status IN ('scheduled', 'confirmed');

  RETURN json_build_object(
    'ok', true,
    'start_date', v_start,
    'end_date', v_end,
    'today', v_today,
    'realized', json_build_object(
      'revenue', round(v_realized_revenue, 2),
      'commission', round(v_realized_commissions, 2),
      'appointments', v_realized_appts,
      'product_sales', 0,
      'product_commission', 0
    ),
    'today_block', json_build_object(
      'realized_revenue', round(v_today_realized_revenue, 2),
      'realized_commission', round(v_today_realized_commissions, 2),
      'realized_appointments', v_today_realized_appts,
      'upcoming_revenue', round(v_today_upcoming_revenue, 2),
      'upcoming_commission', round(v_today_upcoming_commissions, 2),
      'upcoming_appointments', v_today_upcoming_appts
    ),
    'upcoming', json_build_object(
      'revenue', round(v_future_revenue, 2),
      'commission', round(v_future_commissions, 2),
      'appointments', v_future_appts,
      'product_sales', 0,
      'product_commission', 0
    ),
    'days', v_days
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- platform_dashboard_summary — KPIs fixos painel master SaaS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_dashboard_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_today date := current_date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_week_end date := (date_trunc('week', v_today) + interval '6 days')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_month_end date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_companies int := 0;
  v_active_subs int := 0;
  v_past_due int := 0;
  v_mrr numeric := 0;
  v_open_tickets int := 0;
  v_today_payments numeric := 0;
  v_week_payments numeric := 0;
  v_month_payments numeric := 0;
  v_today_new_companies int := 0;
  v_upcoming_renewals int := 0;
  v_upcoming_renewal_revenue numeric := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;

  SELECT count(*)::int INTO v_companies FROM public.companies;

  SELECT
    count(*) FILTER (WHERE ts.status IN ('active', 'trialing'))::int,
    count(*) FILTER (WHERE ts.status = 'past_due')::int,
    COALESCE(sum(CASE WHEN ts.status IN ('active', 'trialing') THEN p.price END), 0)
  INTO v_active_subs, v_past_due, v_mrr
  FROM public.tenant_subscriptions ts
  JOIN public.plans p ON p.id = ts.plan_id;

  SELECT count(*)::int INTO v_open_tickets
  FROM public.support_tickets st
  WHERE st.status IN ('open', 'in_progress');

  SELECT COALESCE(sum(pt.amount), 0) INTO v_today_payments
  FROM public.payment_transactions pt
  WHERE pt.status = 'paid'
    AND pt.paid_at IS NOT NULL
    AND pt.paid_at::date = v_today;

  SELECT COALESCE(sum(pt.amount), 0) INTO v_week_payments
  FROM public.payment_transactions pt
  WHERE pt.status = 'paid'
    AND pt.paid_at IS NOT NULL
    AND pt.paid_at::date BETWEEN v_week_start AND v_week_end;

  SELECT COALESCE(sum(pt.amount), 0) INTO v_month_payments
  FROM public.payment_transactions pt
  WHERE pt.status = 'paid'
    AND pt.paid_at IS NOT NULL
    AND pt.paid_at::date BETWEEN v_month_start AND v_month_end;

  SELECT count(*)::int INTO v_today_new_companies
  FROM public.companies c
  WHERE c.created_at::date = v_today;

  SELECT
    count(*)::int,
    COALESCE(sum(p.price), 0)
  INTO v_upcoming_renewals, v_upcoming_renewal_revenue
  FROM public.tenant_subscriptions ts
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.status IN ('active', 'trialing', 'past_due')
    AND ts.current_period_end IS NOT NULL
    AND ts.current_period_end::date >= v_today
    AND ts.current_period_end::date <= (v_today + 30);

  RETURN json_build_object(
    'ok', true,
    'summary', json_build_object(
      'companies_count', v_companies,
      'active_subscriptions', v_active_subs,
      'past_due_subscriptions', v_past_due,
      'mrr', round(v_mrr, 2),
      'open_tickets', v_open_tickets,
      'today_payments', round(v_today_payments, 2),
      'week_payments', round(v_week_payments, 2),
      'month_payments', round(v_month_payments, 2),
      'today_new_companies', v_today_new_companies,
      'upcoming_renewals_30d', v_upcoming_renewals,
      'upcoming_renewal_revenue_30d', round(v_upcoming_renewal_revenue, 2)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- platform_dashboard_range — intervalo inteligente painel master
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_dashboard_range(
  p_start_date date,
  p_end_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_today date := current_date;
  v_start date;
  v_end date;
  v_realized_revenue numeric := 0;
  v_realized_companies int := 0;
  v_realized_subscriptions int := 0;
  v_today_realized_revenue numeric := 0;
  v_today_realized_companies int := 0;
  v_today_upcoming_revenue numeric := 0;
  v_today_upcoming_renewals int := 0;
  v_future_revenue numeric := 0;
  v_future_renewals int := 0;
  v_days json;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'acesso_negado');
  END IF;

  v_start := LEAST(p_start_date, p_end_date);
  v_end := GREATEST(p_start_date, p_end_date);

  WITH days AS (
    SELECT gs.d::date AS day
    FROM generate_series(v_start, v_end, interval '1 day') AS gs(d)
  ),
  pay_by_day AS (
    SELECT
      d.day,
      COALESCE(sum(CASE WHEN pt.status = 'paid' AND pt.paid_at IS NOT NULL THEN pt.amount END), 0) AS realized_revenue,
      count(*) FILTER (WHERE pt.status = 'paid' AND pt.paid_at IS NOT NULL)::int AS realized_payments
    FROM days d
    LEFT JOIN public.payment_transactions pt
      ON pt.paid_at IS NOT NULL
     AND pt.paid_at::date = d.day
     AND pt.status = 'paid'
    GROUP BY d.day
  ),
  companies_by_day AS (
    SELECT c.created_at::date AS day, count(*)::int AS cnt
    FROM public.companies c
    WHERE c.created_at::date BETWEEN v_start AND v_end
    GROUP BY c.created_at::date
  ),
  renewals_by_day AS (
    SELECT
      ts.current_period_end::date AS day,
      count(*)::int AS cnt,
      COALESCE(sum(p.price), 0) AS revenue
    FROM public.tenant_subscriptions ts
    JOIN public.plans p ON p.id = ts.plan_id
    WHERE ts.status IN ('active', 'trialing', 'past_due')
      AND ts.current_period_end IS NOT NULL
      AND ts.current_period_end::date BETWEEN v_start AND v_end
    GROUP BY ts.current_period_end::date
  ),
  all_days AS (
    SELECT
      d.day,
      COALESCE(pb.realized_revenue, 0) AS realized_revenue,
      COALESCE(pb.realized_payments, 0) AS realized_appointments,
      COALESCE(cb.cnt, 0) AS realized_companies,
      COALESCE(CASE WHEN d.day > v_today THEN rb.revenue WHEN d.day = v_today THEN rb.revenue ELSE 0 END, 0) AS upcoming_revenue,
      COALESCE(CASE WHEN d.day >= v_today THEN rb.cnt ELSE 0 END, 0) AS upcoming_appointments
    FROM days d
    LEFT JOIN pay_by_day pb ON pb.day = d.day
    LEFT JOIN companies_by_day cb ON cb.day = d.day
    LEFT JOIN renewals_by_day rb ON rb.day = d.day
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'date', ad.day,
        'realized_revenue', ad.realized_revenue,
        'realized_commission', ad.realized_companies,
        'realized_appointments', ad.realized_appointments,
        'upcoming_revenue', ad.upcoming_revenue,
        'upcoming_commission', ad.upcoming_appointments,
        'upcoming_appointments', ad.upcoming_appointments,
        'is_today', (ad.day = v_today),
        'is_past', (ad.day < v_today),
        'is_future', (ad.day > v_today)
      )
      ORDER BY ad.day
    ),
    '[]'::json
  )
  INTO v_days
  FROM all_days ad;

  SELECT COALESCE(sum(pt.amount), 0)
  INTO v_realized_revenue
  FROM public.payment_transactions pt
  WHERE pt.status = 'paid'
    AND pt.paid_at IS NOT NULL
    AND pt.paid_at::date BETWEEN v_start AND v_end
    AND pt.paid_at::date < v_today;

  SELECT count(*)::int
  INTO v_realized_companies
  FROM public.companies c
  WHERE c.created_at::date BETWEEN v_start AND v_end
    AND c.created_at::date < v_today;

  SELECT count(*)::int
  INTO v_realized_subscriptions
  FROM public.tenant_subscriptions ts
  WHERE ts.created_at::date BETWEEN v_start AND v_end
    AND ts.created_at::date < v_today;

  SELECT COALESCE(sum(pt.amount), 0)
  INTO v_today_realized_revenue
  FROM public.payment_transactions pt
  WHERE pt.status = 'paid'
    AND pt.paid_at IS NOT NULL
    AND pt.paid_at::date = v_today
    AND v_today BETWEEN v_start AND v_end;

  SELECT count(*)::int
  INTO v_today_realized_companies
  FROM public.companies c
  WHERE c.created_at::date = v_today
    AND v_today BETWEEN v_start AND v_end;

  SELECT
    COALESCE(sum(p.price), 0),
    count(*)::int
  INTO v_today_upcoming_revenue, v_today_upcoming_renewals
  FROM public.tenant_subscriptions ts
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.status IN ('active', 'trialing', 'past_due')
    AND ts.current_period_end IS NOT NULL
    AND ts.current_period_end::date = v_today
    AND v_today BETWEEN v_start AND v_end;

  SELECT
    COALESCE(sum(p.price), 0),
    count(*)::int
  INTO v_future_revenue, v_future_renewals
  FROM public.tenant_subscriptions ts
  JOIN public.plans p ON p.id = ts.plan_id
  WHERE ts.status IN ('active', 'trialing', 'past_due')
    AND ts.current_period_end IS NOT NULL
    AND ts.current_period_end::date BETWEEN GREATEST(v_start, v_today + 1) AND v_end;

  RETURN json_build_object(
    'ok', true,
    'start_date', v_start,
    'end_date', v_end,
    'today', v_today,
    'realized', json_build_object(
      'revenue', round(v_realized_revenue, 2),
      'commission', v_realized_companies,
      'appointments', v_realized_subscriptions,
      'product_sales', 0,
      'product_commission', 0
    ),
    'today_block', json_build_object(
      'realized_revenue', round(v_today_realized_revenue, 2),
      'realized_commission', v_today_realized_companies,
      'realized_appointments', 0,
      'upcoming_revenue', round(v_today_upcoming_revenue, 2),
      'upcoming_commission', v_today_upcoming_renewals,
      'upcoming_appointments', v_today_upcoming_renewals
    ),
    'upcoming', json_build_object(
      'revenue', round(v_future_revenue, 2),
      'commission', v_future_renewals,
      'appointments', v_future_renewals,
      'product_sales', 0,
      'product_commission', 0
    ),
    'days', v_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.appointment_revenue_projected(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.appointment_revenue_realized(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.appointment_provider_commission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_dashboard_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_dashboard_range(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_dashboard_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_dashboard_range(date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.appointment_revenue_projected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_revenue_realized(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_provider_commission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_dashboard_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_dashboard_range(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_dashboard_range(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
