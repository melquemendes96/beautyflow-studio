-- Bloqueios de agenda por prestador + dashboard de comissão individual
-- Depende de: 20260603000000_provider_portal_invites.sql

ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_company_date_provider
  ON public.schedule_blocks (company_id, block_date, provider_id);

-- ---------------------------------------------------------------------------
-- RLS schedule_blocks: prestador só gere bloqueios próprios
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS schedule_blocks_all ON public.schedule_blocks;

CREATE POLICY schedule_blocks_select ON public.schedule_blocks
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY schedule_blocks_insert ON public.schedule_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (
      company_id IN (SELECT public.current_user_company_ids())
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
      company_id IN (SELECT public.current_user_company_ids())
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      company_id IN (SELECT public.current_user_company_ids())
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
      company_id IN (SELECT public.current_user_company_ids())
      AND (
        public.current_user_provider_id_for_company(company_id) IS NULL
        OR provider_id = public.current_user_provider_id_for_company(company_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- get_available_slots — bloqueios globais + do prestador selecionado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_provider_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  svc public.services%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  v_interval integer;
  v_notice integer;
  v_open time;
  v_close time;
  v_working jsonb;
  v_service_minutes integer;
  v_day_index integer;
  v_dow int;
  slots json;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 OR p_service_id IS NULL OR p_date IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT * INTO comp
  FROM public.companies c
  WHERE c.slug = public.normalize_booking_slug(p_slug)
    AND public.company_eligible_for_public_booking(c.id);

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  SELECT * INTO svc
  FROM public.services
  WHERE id = p_service_id AND company_id = comp.id AND active = true;

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  IF svc.service_kind = 'package' AND public.is_company_holiday(comp.id, p_date) THEN
    RETURN '[]'::json;
  END IF;

  IF svc.service_kind = 'package' AND svc.package_allowed_dow IS NOT NULL
     AND jsonb_typeof(svc.package_allowed_dow) = 'array'
     AND jsonb_array_length(svc.package_allowed_dow) > 0 THEN
    v_dow := extract(isodow from p_date)::int;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(svc.package_allowed_dow) elem
      WHERE (elem #>> '{}')::int = v_dow
    ) THEN
      RETURN '[]'::json;
    END IF;
  END IF;

  SELECT * INTO bs FROM public.business_settings WHERE company_id = comp.id;

  v_interval := COALESCE(bs.slot_interval_minutes, 15);
  v_notice := COALESCE(bs.min_schedule_notice_hours, 2);
  v_open := COALESCE(bs.opening_time, '09:00'::time);
  v_close := COALESCE(bs.closing_time, '19:00'::time);
  v_working := COALESCE(bs.working_days, '[true,true,true,true,true,true,false]'::jsonb);

  v_day_index := (extract(isodow from p_date)::int - 1);
  IF jsonb_typeof(v_working) = 'array' AND jsonb_array_length(v_working) = 7 THEN
    IF COALESCE((v_working ->> v_day_index)::boolean, false) = false THEN
      RETURN '[]'::json;
    END IF;
  END IF;

  v_service_minutes := COALESCE(svc.duration_minutes, 0) + COALESCE(svc.buffer_minutes, 0);
  IF v_service_minutes <= 0 THEN
    RETURN '[]'::json;
  END IF;

  WITH
  cfg AS (
    SELECT
      (p_date::timestamp + v_open) AS open_ts,
      (p_date::timestamp + v_close) AS close_ts,
      make_interval(mins => v_interval) AS step,
      make_interval(mins => v_service_minutes) AS svc_len,
      (now() + make_interval(hours => v_notice)) AS min_ts
  ),
  blocks AS (
    SELECT
      CASE
        WHEN sb.block_type = 'manual_block' THEN (p_date::timestamp + sb.time_start)
        WHEN sb.block_type = 'morning_full' THEN (p_date::timestamp + v_open)
        WHEN sb.block_type = 'afternoon_full' THEN (p_date::timestamp + (v_open + ((v_close - v_open) / 2)))
        WHEN sb.block_type = 'day_full' THEN (p_date::timestamp + v_open)
        ELSE (p_date::timestamp + v_open)
      END AS b_start,
      CASE
        WHEN sb.block_type = 'manual_block' THEN (p_date::timestamp + sb.time_end)
        WHEN sb.block_type = 'morning_full' THEN (p_date::timestamp + (v_open + ((v_close - v_open) / 2)))
        WHEN sb.block_type = 'afternoon_full' THEN (p_date::timestamp + v_close)
        WHEN sb.block_type = 'day_full' THEN (p_date::timestamp + v_close)
        ELSE (p_date::timestamp + v_close)
      END AS b_end
    FROM public.schedule_blocks sb
    WHERE sb.company_id = comp.id
      AND sb.block_date = p_date
      AND (
        sb.provider_id IS NULL
        OR sb.provider_id = p_provider_id
      )
  ),
  appts AS (
    SELECT
      (p_date::timestamp + a.appointment_time) AS a_start,
      (p_date::timestamp + a.appointment_time)
        + make_interval(mins => (COALESCE(s.duration_minutes, 0) + COALESCE(s.buffer_minutes, 0))) AS a_end
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    WHERE a.company_id = comp.id
      AND a.appointment_date = p_date
      AND a.status <> 'cancelled'
      AND (
        p_provider_id IS NULL
        OR a.provider_id IS NULL
        OR a.provider_id = p_provider_id
      )
  ),
  candidates AS (
    SELECT gs AS start_ts, (gs + (SELECT svc_len FROM cfg)) AS end_ts
    FROM cfg,
      generate_series(
        (SELECT open_ts FROM cfg),
        (SELECT close_ts FROM cfg) - (SELECT svc_len FROM cfg),
        (SELECT step FROM cfg)
      ) AS gs
  ),
  available AS (
    SELECT start_ts
    FROM candidates c, cfg
    WHERE c.start_ts >= cfg.min_ts
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE c.start_ts < b.b_end AND c.end_ts > b.b_start)
      AND NOT EXISTS (SELECT 1 FROM appts a WHERE c.start_ts < a.a_end AND c.end_ts > a.a_start)
  )
  SELECT COALESCE(json_agg(to_char(start_ts, 'HH24:MI') ORDER BY start_ts), '[]'::json)
  INTO slots FROM available;

  RETURN slots;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(text, uuid, date, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard de comissão do prestador logado
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
    COALESCE(sum(COALESCE(s.price, 0)), 0),
    count(*)::int
  INTO v_today_revenue, v_today_cnt
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.status = 'completed'
    AND a.appointment_date = v_today;

  SELECT
    COALESCE(sum(COALESCE(s.price, 0)), 0),
    count(*)::int
  INTO v_week_revenue, v_week_cnt
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.company_id = p_company_id
    AND a.provider_id = v_provider_id
    AND a.status = 'completed'
    AND a.appointment_date >= v_week_start
    AND a.appointment_date <= v_today;

  SELECT
    COALESCE(sum(COALESCE(s.price, 0)), 0),
    count(*)::int
  INTO v_month_revenue, v_month_cnt
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
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
      COALESCE(sum(COALESCE(s.price, 0)), 0) AS revenue,
      count(a.id)::int AS appointments
    FROM period_rows pr
    LEFT JOIN public.appointments a
      ON a.company_id = p_company_id
     AND a.provider_id = v_provider_id
     AND a.status = 'completed'
     AND a.appointment_date >= pr.start_date
     AND a.appointment_date <= pr.end_date
    LEFT JOIN public.services s ON s.id = a.service_id
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

REVOKE ALL ON FUNCTION public.provider_commission_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_commission_dashboard(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
