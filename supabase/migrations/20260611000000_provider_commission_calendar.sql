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
