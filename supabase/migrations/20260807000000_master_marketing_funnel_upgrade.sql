-- Master tráfego/funil: summary com desafio, série diária, campanhas e por evento.

BEGIN;

CREATE OR REPLACE FUNCTION public.master_marketing_funnel_summary(p_days integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'days', v_days,
    'since', v_since,
    'summary', (
      SELECT json_build_object(
        'demo_views', COUNT(*) FILTER (WHERE event_name = 'demo_view'),
        'whatsapp_clicks', COUNT(*) FILTER (WHERE event_name = 'whatsapp_click'),
        'signup_starts', COUNT(*) FILTER (WHERE event_name = 'signup_start'),
        'signup_completes', COUNT(*) FILTER (WHERE event_name = 'signup_complete'),
        'companies_created', COUNT(*) FILTER (WHERE event_name = 'company_created'),
        'purchases_client', COUNT(*) FILTER (WHERE event_name = 'purchase'),
        'payments_confirmed', COUNT(*) FILTER (WHERE event_name = 'payment_confirmed'),
        'revenue_confirmed', COALESCE(
          SUM(amount) FILTER (WHERE event_name = 'payment_confirmed'),
          0
        ),
        'challenge_banner_views', COUNT(*) FILTER (WHERE event_name = 'challenge_banner_view'),
        'challenge_banner_dismisses', COUNT(*) FILTER (WHERE event_name = 'challenge_banner_dismiss'),
        'challenge_leads', COUNT(*) FILTER (WHERE event_name = 'challenge_lead_submit'),
        'challenge_signups', COUNT(*) FILTER (WHERE event_name = 'challenge_signup'),
        'challenge_activated', COUNT(*) FILTER (WHERE event_name = 'challenge_activated'),
        'total_events', COUNT(*)
      )
      FROM public.marketing_funnel_events
      WHERE created_at >= v_since
    ),
    'daily', (
      SELECT COALESCE(json_agg(row_to_json(d) ORDER BY d.day), '[]'::json)
      FROM (
        SELECT
          gs.day::date AS day,
          COUNT(e.id) FILTER (WHERE e.event_name = 'demo_view') AS demos,
          COUNT(e.id) FILTER (WHERE e.event_name = 'whatsapp_click') AS whatsapp,
          COUNT(e.id) FILTER (
            WHERE e.event_name IN ('signup_complete', 'company_created')
          ) AS signups,
          COUNT(e.id) FILTER (WHERE e.event_name = 'payment_confirmed') AS payments,
          COALESCE(
            SUM(e.amount) FILTER (WHERE e.event_name = 'payment_confirmed'),
            0
          ) AS revenue,
          COUNT(e.id) FILTER (WHERE e.event_name = 'challenge_lead_submit') AS challenge_leads,
          COUNT(e.id) AS events
        FROM generate_series(
          (timezone('America/Sao_Paulo', v_since))::date,
          (timezone('America/Sao_Paulo', now()))::date,
          '1 day'::interval
        ) AS gs(day)
        LEFT JOIN public.marketing_funnel_events e
          ON (timezone('America/Sao_Paulo', e.created_at))::date = gs.day::date
          AND e.created_at >= v_since
        GROUP BY gs.day
      ) d
    ),
    'by_utm_source', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          COALESCE(NULLIF(utm_source, ''), '(direto)') AS utm_source,
          COUNT(*) AS events,
          COUNT(*) FILTER (WHERE event_name = 'whatsapp_click') AS whatsapp_clicks,
          COUNT(*) FILTER (WHERE event_name IN ('signup_complete', 'company_created')) AS signups,
          COUNT(*) FILTER (WHERE event_name = 'payment_confirmed') AS payments,
          COALESCE(SUM(amount) FILTER (WHERE event_name = 'payment_confirmed'), 0) AS revenue
        FROM public.marketing_funnel_events
        WHERE created_at >= v_since
        GROUP BY 1
        ORDER BY events DESC
        LIMIT 25
      ) t
    ),
    'by_utm_campaign', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          COALESCE(NULLIF(utm_campaign, ''), '(sem campanha)') AS utm_campaign,
          COALESCE(NULLIF(utm_source, ''), '(direto)') AS utm_source,
          COUNT(*) AS events,
          COUNT(*) FILTER (WHERE event_name = 'whatsapp_click') AS whatsapp_clicks,
          COUNT(*) FILTER (WHERE event_name IN ('signup_complete', 'company_created')) AS signups,
          COUNT(*) FILTER (WHERE event_name = 'payment_confirmed') AS payments,
          COALESCE(SUM(amount) FILTER (WHERE event_name = 'payment_confirmed'), 0) AS revenue
        FROM public.marketing_funnel_events
        WHERE created_at >= v_since
        GROUP BY 1, 2
        ORDER BY events DESC
        LIMIT 25
      ) t
    ),
    'by_event', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          event_name,
          COUNT(*) AS events,
          COALESCE(SUM(amount) FILTER (WHERE event_name = 'payment_confirmed'), 0) AS revenue
        FROM public.marketing_funnel_events
        WHERE created_at >= v_since
        GROUP BY event_name
        ORDER BY events DESC
      ) t
    ),
    'recent', (
      SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
      FROM (
        SELECT
          id,
          event_name,
          path,
          company_id,
          amount,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          created_at
        FROM public.marketing_funnel_events
        WHERE created_at >= v_since
        ORDER BY created_at DESC
        LIMIT 80
      ) r
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.master_marketing_funnel_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_marketing_funnel_summary(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
