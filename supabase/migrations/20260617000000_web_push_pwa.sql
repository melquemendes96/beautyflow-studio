-- Web Push: subscriptions, outbox, triggers (agendamento, pagamento, cancelamento).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  profile text NOT NULL DEFAULT 'admin' CHECK (profile IN ('admin', 'staff', 'master')),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company ON public.push_subscriptions (company_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.push_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('booking', 'payment', 'cancellation')),
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/admin/agenda',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  delivery_error text
);

CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON public.push_notification_outbox (created_at)
  WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS public.platform_push_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  functions_base_url text,
  internal_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_push_config (id, functions_base_url, internal_secret)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_push_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY push_outbox_select_admin
  ON public.push_notification_outbox FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY platform_push_config_select_admin
  ON public.platform_push_config FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY platform_push_config_update_admin
  ON public.platform_push_config FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Enfileira notificação push para a empresa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_company_push(
  p_company_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text DEFAULT '/admin/agenda'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_cfg public.platform_push_config%ROWTYPE;
  v_url text;
  v_body jsonb;
BEGIN
  IF p_company_id IS NULL OR p_title IS NULL OR p_body IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.push_notification_outbox (company_id, kind, title, body, url)
  VALUES (p_company_id, p_kind, p_title, p_body, COALESCE(NULLIF(trim(p_url), ''), '/admin/agenda'))
  RETURNING id INTO v_id;

  SELECT * INTO v_cfg FROM public.platform_push_config WHERE id = 1;

  IF v_cfg.functions_base_url IS NOT NULL AND v_cfg.internal_secret IS NOT NULL THEN
    BEGIN
      v_url := rtrim(v_cfg.functions_base_url, '/') || '/functions/v1/deliver-web-push';
      v_body := jsonb_build_object(
        'mode', 'direct',
        'company_id', p_company_id,
        'title', p_title,
        'body', p_body,
        'url', COALESCE(NULLIF(trim(p_url), ''), '/admin/agenda'),
        'secret', v_cfg.internal_secret
      );
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_body
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_company_push(uuid, text, text, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Salvar subscription Web Push (admin / equipe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_company_id uuid DEFAULT NULL,
  p_profile text DEFAULT 'admin',
  p_user_agent text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF p_endpoint IS NULL OR length(trim(p_endpoint)) < 8 THEN
    RETURN json_build_object('ok', false, 'error', 'endpoint_invalido');
  END IF;

  IF p_company_id IS NOT NULL AND NOT (
    p_company_id IN (SELECT public.current_user_company_ids())
    OR public.is_platform_admin()
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id, company_id, endpoint, p256dh, auth, profile, user_agent, updated_at
  )
  VALUES (
    v_uid,
    p_company_id,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    CASE WHEN p_profile IN ('admin', 'staff', 'master') THEN p_profile ELSE 'admin' END,
    NULLIF(trim(p_user_agent), ''),
    now()
  )
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    company_id = EXCLUDED.company_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    profile = EXCLUDED.profile,
    user_agent = EXCLUDED.user_agent,
    updated_at = now();

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_push_subscription(text, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  DELETE FROM public.push_subscriptions
  WHERE endpoint = trim(p_endpoint)
    AND (user_id = auth.uid() OR public.is_platform_admin());

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Dispara entrega da fila (chamado pelo app admin quando aberto)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_push_outbox_delivery(p_limit integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cfg public.platform_push_config%ROWTYPE;
  v_url text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_cfg FROM public.platform_push_config WHERE id = 1;

  IF v_cfg.functions_base_url IS NULL OR v_cfg.internal_secret IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'push_nao_configurado');
  END IF;

  v_url := rtrim(v_cfg.functions_base_url, '/') || '/functions/v1/deliver-web-push';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'mode', 'process_outbox',
      'limit', LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100),
      'secret', v_cfg.internal_secret
    )
  );

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.request_push_outbox_delivery(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_push_outbox_delivery(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: agendamento, cancelamento, pagamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_appointments_push_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_service_name text;
  v_date_label text;
  v_time_label text;
BEGIN
  SELECT c.name INTO v_client_name FROM public.clients c WHERE c.id = NEW.client_id;
  SELECT s.name INTO v_service_name FROM public.services s WHERE s.id = NEW.service_id;

  v_date_label := to_char(NEW.appointment_date, 'DD/MM');
  v_time_label := to_char(NEW.appointment_time, 'HH24:MI');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_company_push(
      NEW.company_id,
      'booking',
      'Novo agendamento',
      COALESCE(v_client_name, 'Cliente') || ' · ' || COALESCE(v_service_name, 'Serviço')
        || ' · ' || v_date_label || ' ' || v_time_label,
      '/admin/agenda'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.status = 'cancelled'
    AND COALESCE(OLD.status, '') IS DISTINCT FROM 'cancelled'
  THEN
    PERFORM public.enqueue_company_push(
      NEW.company_id,
      'cancellation',
      'Agendamento cancelado',
      COALESCE(v_client_name, 'Cliente') || ' · ' || COALESCE(v_service_name, 'Serviço')
        || ' · ' || v_date_label || ' ' || v_time_label,
      '/admin/agenda'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_push_notify ON public.appointments;
CREATE TRIGGER trg_appointments_push_notify
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_appointments_push_notify();

CREATE OR REPLACE FUNCTION public.trg_payments_push_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status = 'paid'
    AND COALESCE(OLD.status, '') IS DISTINCT FROM 'paid'
  THEN
    v_amount := to_char(COALESCE(NEW.amount, 0), 'FM999G999G990D00');
    PERFORM public.enqueue_company_push(
      NEW.company_id,
      'payment',
      'Pagamento confirmado',
      'R$ ' || replace(v_amount, ',', ','),
      '/admin/plano'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_push_notify ON public.payment_transactions;
CREATE TRIGGER trg_payments_push_notify
  AFTER UPDATE OF status ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payments_push_notify();

COMMENT ON TABLE public.platform_push_config IS
  'Configure functions_base_url (https://REF.supabase.co) e internal_secret (mesmo valor do secret PUSH_INTERNAL_SECRET na Edge Function).';

COMMIT;
