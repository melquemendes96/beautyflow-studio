-- Push: entrega confiável com app fechado (process_outbox + cron backup).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ---------------------------------------------------------------------------
-- Enfileira e dispara entrega via fila (evita duplicar direct + outbox)
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
        'mode', 'process_outbox',
        'limit', 20,
        'secret', v_cfg.internal_secret
      );
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_body
      );
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.push_notification_outbox
        SET delivery_error = left(SQLERRM, 500)
        WHERE id = v_id;
    END;
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cron backup: processa fila a cada minuto (app fechado / falha pg_net)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_process_push_outbox()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.platform_push_config%ROWTYPE;
  v_url text;
BEGIN
  SELECT * INTO v_cfg FROM public.platform_push_config WHERE id = 1;
  IF v_cfg.functions_base_url IS NULL OR v_cfg.internal_secret IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.push_notification_outbox WHERE delivered_at IS NULL LIMIT 1
  ) THEN
    RETURN;
  END IF;

  v_url := rtrim(v_cfg.functions_base_url, '/') || '/functions/v1/deliver-web-push';
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'mode', 'process_outbox',
      'limit', 30,
      'secret', v_cfg.internal_secret
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cron_process_push_outbox() FROM PUBLIC;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('bf-push-outbox-1min');
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    PERFORM cron.schedule(
      'bf-push-outbox-1min',
      '* * * * *',
      $job$SELECT public.cron_process_push_outbox();$job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron não disponível para push outbox: %', SQLERRM;
END;
$cron$;

COMMIT;
