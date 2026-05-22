-- Auditoria de eventos Mercado Pago / webhook (Fase A pré-venda).
-- Inserções apenas via service_role (Edge Function). Leitura: platform_admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event text NOT NULL,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_logs_company_id_idx ON public.payment_logs(company_id);
CREATE INDEX IF NOT EXISTS payment_logs_created_at_idx ON public.payment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS payment_logs_event_idx ON public.payment_logs(event);

COMMENT ON TABLE public.payment_logs IS 'Log sanitizado de webhooks MP e etapas de cobrança (sem PII completa).';
COMMENT ON COLUMN public.payment_logs.payload IS 'JSON reduzido: ids, status, tipo — sem cartão, e-mail ou documento.';

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_logs_select_platform_admin ON public.payment_logs;
CREATE POLICY payment_logs_select_platform_admin
  ON public.payment_logs
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON TABLE public.payment_logs FROM PUBLIC;
GRANT SELECT ON TABLE public.payment_logs TO authenticated;

COMMIT;
