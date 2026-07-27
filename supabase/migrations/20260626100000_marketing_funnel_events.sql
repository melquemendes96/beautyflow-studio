-- Marketing funnel: eventos críticos (demo, WhatsApp, cadastro, pagamento) para Master + ads.

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (
    event_name IN (
      'demo_view',
      'whatsapp_click',
      'signup_start',
      'signup_complete',
      'purchase',
      'company_created',
      'payment_confirmed'
    )
  ),
  path text,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  amount numeric(12, 2),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_funnel_events_created
  ON public.marketing_funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_funnel_events_name_created
  ON public.marketing_funnel_events (event_name, created_at DESC);

ALTER TABLE public.marketing_funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_funnel_select_master ON public.marketing_funnel_events;
CREATE POLICY marketing_funnel_select_master
  ON public.marketing_funnel_events FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Cliente / anon: grava eventos de funil (sem dados sensíveis)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_marketing_event(
  p_event_name text,
  p_path text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_amount numeric DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_name text := lower(trim(COALESCE(p_event_name, '')));
  v_uid uuid := auth.uid();
BEGIN
  IF v_name NOT IN (
    'demo_view',
    'whatsapp_click',
    'signup_start',
    'signup_complete',
    'purchase'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'evento_invalido');
  END IF;

  INSERT INTO public.marketing_funnel_events (
    event_name, path, company_id, user_id, amount,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, metadata
  )
  VALUES (
    v_name,
    NULLIF(left(trim(COALESCE(p_path, '')), 300), ''),
    p_company_id,
    v_uid,
    p_amount,
    NULLIF(left(trim(COALESCE(p_utm_source, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_medium, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_campaign, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_content, '')), 120), ''),
    NULLIF(left(trim(COALESCE(p_utm_term, '')), 120), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.track_marketing_event(
  text, text, text, text, text, text, text, jsonb, numeric, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_marketing_event(
  text, text, text, text, text, text, text, jsonb, numeric, uuid
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers server-side (fonte da verdade para Master)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_companies_marketing_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.marketing_funnel_events (event_name, company_id, metadata)
  VALUES (
    'company_created',
    NEW.id,
    jsonb_build_object('slug', NEW.slug, 'name', NEW.name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_marketing_created ON public.companies;
CREATE TRIGGER trg_companies_marketing_created
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_companies_marketing_created();

CREATE OR REPLACE FUNCTION public.trg_payments_marketing_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status = 'paid'
    AND COALESCE(OLD.status, '') IS DISTINCT FROM 'paid'
  THEN
    INSERT INTO public.marketing_funnel_events (
      event_name, company_id, amount, metadata
    )
    VALUES (
      'payment_confirmed',
      NEW.company_id,
      COALESCE(NEW.amount, 0),
      jsonb_build_object('payment_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_marketing_notify ON public.payment_transactions;
CREATE TRIGGER trg_payments_marketing_notify
  AFTER UPDATE OF status ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payments_marketing_notify();

-- ---------------------------------------------------------------------------
-- Resumo Master
-- ---------------------------------------------------------------------------
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
        )
      )
      FROM public.marketing_funnel_events
      WHERE created_at >= v_since
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
        LIMIT 20
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
          created_at
        FROM public.marketing_funnel_events
        WHERE created_at >= v_since
        ORDER BY created_at DESC
        LIMIT 40
      ) r
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.master_marketing_funnel_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_marketing_funnel_summary(integer) TO authenticated;

COMMIT;
