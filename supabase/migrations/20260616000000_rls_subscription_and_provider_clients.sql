-- RLS: bloqueio de painel sem assinatura válida + prestador só vê clientes vinculados.
-- Espelha guardCompanyTenantBillingAccess / company_eligible_for_public_booking no banco.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_subscription_allows_panel_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.company_eligible_for_public_booking(p_company_id);
$$;

COMMENT ON FUNCTION public.company_subscription_allows_panel_access(uuid) IS
  'Painel tenant: empresa não suspensa + assinatura active/trialing dentro do prazo.';

CREATE OR REPLACE FUNCTION public.user_can_access_company_panel(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      p_company_id IN (SELECT public.current_user_company_ids())
      AND public.company_subscription_allows_panel_access(p_company_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.assert_company_panel_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  IF public.is_platform_admin() THEN
    RETURN;
  END IF;

  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_subscription_allows_panel_access(p_company_id) THEN
    RAISE EXCEPTION 'Assinatura inativa ou expirada.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.company_subscription_allows_panel_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_company_panel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_company_panel_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_subscription_allows_panel_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_company_panel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_company_panel_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_can_access_client(p_company_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    p_client_id IS NOT NULL
    AND public.current_user_provider_id_for_company(p_company_id) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = p_client_id
        AND c.company_id = p_company_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.company_id = p_company_id
          AND a.client_id = p_client_id
          AND a.provider_id = public.current_user_provider_id_for_company(p_company_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.client_tabs t
        WHERE t.company_id = p_company_id
          AND t.client_id = p_client_id
          AND t.provider_id = public.current_user_provider_id_for_company(p_company_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_client(p_company_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(p_company_id)
      AND (
        public.current_user_provider_id_for_company(p_company_id) IS NULL
        OR public.provider_can_access_client(p_company_id, p_client_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_insert_client(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR public.user_can_access_company_panel(p_company_id);
$$;

CREATE OR REPLACE FUNCTION public.user_can_update_client(p_company_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(p_company_id)
      AND (
        public.current_user_provider_id_for_company(p_company_id) IS NULL
        OR public.provider_can_access_client(p_company_id, p_client_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_delete_client(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(p_company_id)
      AND p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    );
$$;

REVOKE ALL ON FUNCTION public.provider_can_access_client(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_read_client(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_update_client(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_delete_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_can_access_client(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_client(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_insert_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_update_client(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_delete_client(uuid) TO authenticated;

-- Prestador: agenda/comandas filtradas + assinatura ativa
CREATE OR REPLACE FUNCTION public.user_can_access_company_appointment(p_company_id uuid, p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(p_company_id)
      AND (
        public.current_user_provider_id_for_company(p_company_id) IS NULL
        OR p_provider_id = public.current_user_provider_id_for_company(p_company_id)
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- clients — prestador só lê/edita clientes com atendimento ou comanda dele
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS clients_all ON public.clients;

CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (public.user_can_read_client(company_id, id));

CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_client(company_id));

CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING (public.user_can_update_client(company_id, id))
  WITH CHECK (public.user_can_update_client(company_id, id));

CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (public.user_can_delete_client(company_id));

-- ---------------------------------------------------------------------------
-- services, waitlist, appointment_ratings — membro + assinatura
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS services_all ON public.services;

CREATE POLICY services_select ON public.services
  FOR SELECT TO authenticated
  USING (public.user_can_access_company_panel(company_id));

CREATE POLICY services_insert ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  );

CREATE POLICY services_update ON public.services
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  );

CREATE POLICY services_delete ON public.services
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

DROP POLICY IF EXISTS waitlist_all ON public.waitlist;

CREATE POLICY waitlist_all ON public.waitlist
  FOR ALL TO authenticated
  USING (public.user_can_access_company_panel(company_id))
  WITH CHECK (public.user_can_access_company_panel(company_id));

DROP POLICY IF EXISTS appointment_ratings_all ON public.appointment_ratings;

CREATE POLICY appointment_ratings_all ON public.appointment_ratings
  FOR ALL TO authenticated
  USING (public.user_can_access_company_panel(company_id))
  WITH CHECK (public.user_can_access_company_panel(company_id));

-- ---------------------------------------------------------------------------
-- schedule_blocks — assinatura + regras de prestador existentes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS schedule_blocks_select ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_insert ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_update ON public.schedule_blocks;
DROP POLICY IF EXISTS schedule_blocks_delete ON public.schedule_blocks;

CREATE POLICY schedule_blocks_select ON public.schedule_blocks
  FOR SELECT TO authenticated
  USING (public.user_can_access_company_panel(company_id));

CREATE POLICY schedule_blocks_insert ON public.schedule_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  );

CREATE POLICY schedule_blocks_update ON public.schedule_blocks
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  );

CREATE POLICY schedule_blocks_delete ON public.schedule_blocks
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Equipe / pacotes — assinatura
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS service_providers_tenant ON public.service_providers;
CREATE POLICY service_providers_tenant ON public.service_providers
  FOR ALL TO authenticated
  USING (public.user_can_access_company_panel(company_id))
  WITH CHECK (public.user_can_access_company_panel(company_id));

DROP POLICY IF EXISTS provider_services_tenant ON public.provider_services;
CREATE POLICY provider_services_tenant ON public.provider_services
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.service_providers sp
      WHERE sp.id = provider_id
        AND public.user_can_access_company_panel(sp.company_id)
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.service_providers sp
      WHERE sp.id = provider_id
        AND public.user_can_access_company_panel(sp.company_id)
    )
  );

DROP POLICY IF EXISTS client_packages_tenant ON public.client_packages;
CREATE POLICY client_packages_tenant ON public.client_packages
  FOR ALL TO authenticated
  USING (public.user_can_access_company_panel(company_id))
  WITH CHECK (public.user_can_access_company_panel(company_id));

DROP POLICY IF EXISTS company_holidays_tenant ON public.company_holidays;
CREATE POLICY company_holidays_tenant ON public.company_holidays
  FOR ALL TO authenticated
  USING (public.user_can_access_company_panel(company_id))
  WITH CHECK (public.user_can_access_company_panel(company_id));

-- ---------------------------------------------------------------------------
-- Comandas / estoque / caixa / repasses — owner-admin + assinatura
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_tabs_tenant ON public.client_tabs;
CREATE POLICY client_tabs_tenant ON public.client_tabs
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND public.user_can_access_company_appointment(company_id, provider_id)
    )
  );

DROP POLICY IF EXISTS client_tab_lines_tenant ON public.client_tab_lines;
CREATE POLICY client_tab_lines_tenant ON public.client_tab_lines
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.user_can_access_company_panel(company_id)
  );

DROP POLICY IF EXISTS products_company ON public.products;
CREATE POLICY products_company ON public.products
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

DROP POLICY IF EXISTS stock_movements_company ON public.stock_movements;
CREATE POLICY stock_movements_company ON public.stock_movements
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

DROP POLICY IF EXISTS service_consumables_company ON public.service_consumables;
CREATE POLICY service_consumables_company ON public.service_consumables
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

DROP POLICY IF EXISTS cash_sessions_company ON public.cash_register_sessions;
CREATE POLICY cash_sessions_company ON public.cash_register_sessions
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

DROP POLICY IF EXISTS cash_counts_session ON public.cash_register_counts;
CREATE POLICY cash_counts_session ON public.cash_register_counts
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND session_id IN (
        SELECT s.id
        FROM public.cash_register_sessions s
        WHERE s.company_id IN (SELECT public.current_user_owner_admin_company_ids())
          AND public.user_can_access_company_panel(s.company_id)
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      session_id IN (
        SELECT s.id
        FROM public.cash_register_sessions s
        WHERE s.company_id IN (SELECT public.current_user_owner_admin_company_ids())
          AND public.user_can_access_company_panel(s.company_id)
      )
    )
  );

DROP POLICY IF EXISTS provider_payouts_company ON public.provider_payouts;
CREATE POLICY provider_payouts_company ON public.provider_payouts
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND (
        company_id IN (SELECT public.current_user_owner_admin_company_ids())
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- RPC repasses — checagem de assinatura (corpo base: 20260613000002)
-- ---------------------------------------------------------------------------
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

  IF NOT public.company_subscription_allows_panel_access(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_inativa');
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

-- Dashboard/calendário prestador: assert no início (corpos em 20260610000000 / 20260611000000)
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

  PERFORM public.assert_company_panel_access(p_company_id);

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

  PERFORM public.assert_company_panel_access(p_company_id);

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

-- financeiro: exige assinatura ativa além da feature do plano
DROP POLICY IF EXISTS financial_entries_select ON public.financial_entries;
CREATE POLICY financial_entries_select ON public.financial_entries
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(company_id, 'finance')
    )
  );

DROP POLICY IF EXISTS financial_entries_write ON public.financial_entries;
CREATE POLICY financial_entries_write ON public.financial_entries
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(company_id, 'finance')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.user_can_access_company_panel(company_id)
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(company_id, 'finance')
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
