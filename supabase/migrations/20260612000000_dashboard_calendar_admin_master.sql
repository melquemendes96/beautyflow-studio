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
