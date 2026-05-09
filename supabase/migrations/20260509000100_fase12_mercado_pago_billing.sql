-- Fase 12 — Billing multi-tenant: tenant_subscriptions, payment_transactions, Mercado Pago
-- Substitui subscriptions/payments. Integração gateway via Edge Functions (access token só no servidor).

BEGIN;

-- ---------------------------------------------------------------------------
-- Clientes MP (opcional; 1 por empresa para futuras cobranças recorrentes no MP)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mercado_pago_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies (id) ON DELETE CASCADE,
  mp_customer_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_mercado_pago_customers_updated_at
  BEFORE UPDATE ON public.mercado_pago_customers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.mercado_pago_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY mercado_pago_customers_select
  ON public.mercado_pago_customers FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY mercado_pago_customers_write
  ON public.mercado_pago_customers FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY mercado_pago_customers_update
  ON public.mercado_pago_customers FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY mercado_pago_customers_delete
  ON public.mercado_pago_customers FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Assinatura por tenant (1 por empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies (id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans (id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_used BOOLEAN NOT NULL DEFAULT false,
  last_plan_change_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_subscriptions_plan ON public.tenant_subscriptions (plan_id);
CREATE INDEX idx_tenant_subscriptions_status ON public.tenant_subscriptions (status);

CREATE TRIGGER trg_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transações de pagamento (faturas / tentativas de cobrança)
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  tenant_subscription_id UUID REFERENCES public.tenant_subscriptions (id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gateway_provider TEXT NOT NULL DEFAULT 'manual',
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  gateway_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_payment_transactions_company ON public.payment_transactions (company_id, created_at DESC);
CREATE INDEX idx_payment_transactions_subscription ON public.payment_transactions (tenant_subscription_id);

CREATE UNIQUE INDEX idx_payment_transactions_mp_pref
  ON public.payment_transactions (mp_preference_id)
  WHERE mp_preference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Migrar dados legados (subscriptions / payments)
-- ---------------------------------------------------------------------------
INSERT INTO public.tenant_subscriptions (
  id, company_id, plan_id, status, current_period_start, current_period_end,
  trial_used, last_plan_change_at, created_at, updated_at
)
SELECT
  id, company_id, plan_id, status, current_period_start, current_period_end,
  COALESCE(trial_used, false),
  last_plan_change_at,
  created_at, updated_at
FROM public.subscriptions;

DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL THEN
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gateway_provider TEXT;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gateway_metadata JSONB DEFAULT '{}'::jsonb;
    UPDATE public.payments SET gateway_metadata = '{}'::jsonb WHERE gateway_metadata IS NULL;
    ALTER TABLE public.payments ALTER COLUMN gateway_metadata SET DEFAULT '{}'::jsonb;
    ALTER TABLE public.payments ALTER COLUMN gateway_metadata SET NOT NULL;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'provider'
    ) THEN
      EXECUTE $u$
        UPDATE public.payments
        SET gateway_provider = COALESCE(gateway_provider, provider, 'manual')
      $u$;
    ELSE
      UPDATE public.payments SET gateway_provider = COALESCE(gateway_provider, 'manual') WHERE gateway_provider IS NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'external_checkout_session_id'
    ) THEN
      EXECUTE $u$
        UPDATE public.payments
        SET gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'legacy_external_checkout_session_id', external_checkout_session_id
        ))
        WHERE external_checkout_session_id IS NOT NULL
      $u$;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'external_payment_intent_id'
    ) THEN
      EXECUTE $u$
        UPDATE public.payments
        SET gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'legacy_external_payment_ref', external_payment_intent_id
        ))
        WHERE external_payment_intent_id IS NOT NULL
      $u$;
    END IF;
  END IF;
END $$;

INSERT INTO public.payment_transactions (
  id, company_id, tenant_subscription_id, amount, status, payment_method, due_date, paid_at, created_at,
  gateway_provider, mp_preference_id, mp_payment_id, gateway_metadata
)
SELECT
  p.id,
  p.company_id,
  p.subscription_id,
  p.amount,
  p.status,
  p.payment_method,
  p.due_date,
  p.paid_at,
  p.created_at,
  COALESCE(
    NULLIF(trim(COALESCE(p.gateway_provider, '')), ''),
    'manual'
  ),
  p.mp_preference_id,
  p.mp_payment_id,
  COALESCE(p.gateway_metadata, '{}'::jsonb)
FROM public.payments p;

-- ---------------------------------------------------------------------------
-- Remover tabelas antigas e políticas associadas
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;

-- ---------------------------------------------------------------------------
-- RLS — tenant_subscriptions & payment_transactions (mesmo modelo da fase 3)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_subscriptions_select
  ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY tenant_subscriptions_write
  ON public.tenant_subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY tenant_subscriptions_update
  ON public.tenant_subscriptions FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY tenant_subscriptions_delete
  ON public.tenant_subscriptions FOR DELETE TO authenticated
  USING (public.is_platform_admin());

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_transactions_select
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY payment_transactions_insert
  ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY payment_transactions_update
  ON public.payment_transactions FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY payment_transactions_delete
  ON public.payment_transactions FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Checkout empresa (regras fase 10)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_start_checkout(
  p_company_id uuid,
  p_plan_id uuid,
  p_payment_method public.payment_method_preference,
  p_trial boolean DEFAULT false,
  p_legal_name text DEFAULT NULL,
  p_document text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address_line1 text DEFAULT NULL,
  p_address_line2 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_postal_code text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_row public.plans%ROWTYPE;
  sub_row public.tenant_subscriptions%ROWTYPE;
  pay_id uuid;
  can_change_plan boolean;
BEGIN
  IF p_company_id IS NULL OR p_plan_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (p_company_id IN (SELECT public.current_user_company_ids())) THEN
    RETURN json_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT * INTO plan_row FROM public.plans WHERE id = p_plan_id AND active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_invalido');
  END IF;

  INSERT INTO public.billing_profiles (
    company_id, legal_name, document, email, phone, address_line1, address_line2, city, state, postal_code
  ) VALUES (
    p_company_id, p_legal_name, p_document, p_email, p_phone, p_address_line1, p_address_line2, p_city, p_state, p_postal_code
  )
  ON CONFLICT (company_id) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    document = EXCLUDED.document,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    address_line1 = EXCLUDED.address_line1,
    address_line2 = EXCLUDED.address_line2,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    postal_code = EXCLUDED.postal_code;

  SELECT * INTO sub_row FROM public.tenant_subscriptions WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    INSERT INTO public.tenant_subscriptions (
      company_id, plan_id, status, current_period_start, current_period_end, trial_used, last_plan_change_at
    )
    VALUES (
      p_company_id,
      p_plan_id,
      CASE WHEN p_trial THEN 'trialing'::public.subscription_status ELSE 'past_due'::public.subscription_status END,
      now(),
      CASE WHEN p_trial THEN now() + interval '7 days' ELSE NULL END,
      CASE WHEN p_trial THEN true ELSE false END,
      now()
    )
    RETURNING * INTO sub_row;
  ELSE
    IF p_trial AND sub_row.trial_used THEN
      RETURN json_build_object('ok', false, 'error', 'trial_ja_usado');
    END IF;

    can_change_plan := (sub_row.plan_id = p_plan_id)
      OR (sub_row.last_plan_change_at IS NULL)
      OR (sub_row.last_plan_change_at <= now() - interval '30 days');

    IF NOT can_change_plan THEN
      RETURN json_build_object('ok', false, 'error', 'troca_plano_bloqueada');
    END IF;

    UPDATE public.tenant_subscriptions
    SET
      plan_id = p_plan_id,
      last_plan_change_at = CASE WHEN sub_row.plan_id <> p_plan_id THEN now() ELSE sub_row.last_plan_change_at END,
      status = CASE
        WHEN p_trial THEN 'trialing'::public.subscription_status
        ELSE sub_row.status
      END,
      current_period_start = CASE
        WHEN p_trial THEN now()
        ELSE sub_row.current_period_start
      END,
      current_period_end = CASE
        WHEN p_trial THEN now() + interval '7 days'
        ELSE sub_row.current_period_end
      END,
      trial_used = CASE
        WHEN p_trial THEN true
        ELSE sub_row.trial_used
      END
    WHERE id = sub_row.id
    RETURNING * INTO sub_row;
  END IF;

  IF NOT p_trial THEN
    INSERT INTO public.payment_transactions (
      company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
    )
    VALUES (
      p_company_id,
      sub_row.id,
      plan_row.price,
      'pending'::public.payment_status,
      p_payment_method::text,
      (now()::date + 3),
      'manual'
    )
    RETURNING id INTO pay_id;
  END IF;

  INSERT INTO public.support_tickets (company_id, subject, message, status, priority)
  VALUES (
    p_company_id,
    'Solicitação de assinatura / pagamento',
    concat(
      'Plano: ', plan_row.name, E'\n',
      'Método: ', p_payment_method::text, E'\n',
      'Trial: ', CASE WHEN p_trial THEN 'sim' ELSE 'não' END, E'\n',
      'PaymentId: ', COALESCE(pay_id::text, '-')
    ),
    'open'::public.support_ticket_status,
    'normal'::public.support_priority
  );

  RETURN json_build_object('ok', true, 'subscription_id', sub_row.id, 'payment_id', pay_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.company_start_checkout(
  uuid, uuid, public.payment_method_preference, boolean,
  text, text, text, text, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.company_start_checkout IS 'Checkout: billing_profiles + tenant_subscriptions + payment_transactions + ticket.';

-- ---------------------------------------------------------------------------
-- Master: aplicar pagamento e renovar (2 e 3 argumentos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_apply_payment(
  p_payment_id uuid,
  p_months integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payment_transactions%ROWTYPE;
  sub public.tenant_subscriptions%ROWTYPE;
  plan public.plans%ROWTYPE;
  base_end timestamptz;
  new_end timestamptz;
  next_payment_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'payment_id_obrigatorio');
  END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RETURN json_build_object('ok', false, 'error', 'meses_invalidos');
  END IF;

  SELECT * INTO pay FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF pay.tenant_subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_sem_assinatura');
  END IF;

  SELECT * INTO sub FROM public.tenant_subscriptions WHERE id = pay.tenant_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  SELECT * INTO plan FROM public.plans WHERE id = sub.plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  UPDATE public.payment_transactions
  SET status = 'paid', paid_at = COALESCE(pay.paid_at, now())
  WHERE id = pay.id;

  base_end := COALESCE(sub.current_period_end, now());
  IF base_end < now() THEN base_end := now(); END IF;
  new_end := base_end + make_interval(months => p_months);

  UPDATE public.tenant_subscriptions
  SET
    status = 'active',
    current_period_start = COALESCE(sub.current_period_start, now()),
    current_period_end = new_end,
    updated_at = now()
  WHERE id = sub.id;

  UPDATE public.companies SET status = 'active' WHERE id = sub.company_id;

  INSERT INTO public.payment_transactions (
    company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
  )
  VALUES (
    sub.company_id, sub.id, plan.price, 'pending', 'manual', (new_end::date), 'manual'
  )
  RETURNING id INTO next_payment_id;

  RETURN json_build_object(
    'ok', true,
    'subscription_id', sub.id,
    'payment_id', pay.id,
    'new_period_end', new_end,
    'next_payment_id', next_payment_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

CREATE OR REPLACE FUNCTION public.master_apply_payment(
  p_payment_id uuid,
  p_months integer,
  p_allow_canceled boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payment_transactions%ROWTYPE;
  sub public.tenant_subscriptions%ROWTYPE;
  plan public.plans%ROWTYPE;
  base_end timestamptz;
  new_end timestamptz;
  next_payment_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'payment_id_obrigatorio');
  END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RETURN json_build_object('ok', false, 'error', 'meses_invalidos');
  END IF;

  SELECT * INTO pay FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF pay.tenant_subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_sem_assinatura');
  END IF;

  SELECT * INTO sub FROM public.tenant_subscriptions WHERE id = pay.tenant_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  IF sub.status = 'canceled' AND coalesce(p_allow_canceled, false) = false THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_cancelada');
  END IF;

  SELECT * INTO plan FROM public.plans WHERE id = sub.plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  UPDATE public.payment_transactions
  SET status = 'paid', paid_at = COALESCE(pay.paid_at, now())
  WHERE id = pay.id;

  base_end := COALESCE(sub.current_period_end, now());
  IF base_end < now() THEN base_end := now(); END IF;
  new_end := base_end + make_interval(months => p_months);

  UPDATE public.tenant_subscriptions
  SET
    status = 'active',
    current_period_start = COALESCE(sub.current_period_start, now()),
    current_period_end = new_end,
    updated_at = now()
  WHERE id = sub.id;

  UPDATE public.companies SET status = 'active' WHERE id = sub.company_id;

  INSERT INTO public.payment_transactions (
    company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
  )
  VALUES (
    sub.company_id, sub.id, plan.price, 'pending', 'manual', (new_end::date), 'manual'
  )
  RETURNING id INTO next_payment_id;

  RETURN json_build_object(
    'ok', true,
    'subscription_id', sub.id,
    'payment_id', pay.id,
    'new_period_end', new_end,
    'next_payment_id', next_payment_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

GRANT EXECUTE ON FUNCTION public.master_apply_payment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_apply_payment(uuid, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_create_pending_invoice(
  p_subscription_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.tenant_subscriptions%ROWTYPE;
  plan public.plans%ROWTYPE;
  new_payment_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'subscription_id_obrigatorio');
  END IF;

  SELECT * INTO sub FROM public.tenant_subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  SELECT * INTO plan FROM public.plans WHERE id = sub.plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  INSERT INTO public.payment_transactions (
    company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
  )
  VALUES (
    sub.company_id, sub.id, plan.price, 'pending', 'manual', COALESCE(p_due_date, (now()::date)), 'manual'
  )
  RETURNING id INTO new_payment_id;

  RETURN json_build_object('ok', true, 'payment_id', new_payment_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

GRANT EXECUTE ON FUNCTION public.master_create_pending_invoice(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Webhook Mercado Pago (service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_apply_payment_renewal(
  p_payment_id uuid,
  p_months integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payment_transactions%ROWTYPE;
  sub public.tenant_subscriptions%ROWTYPE;
  plan public.plans%ROWTYPE;
  base_end timestamptz;
  new_end timestamptz;
  next_payment_id uuid;
BEGIN
  IF (SELECT auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'payment_id_obrigatorio');
  END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RETURN json_build_object('ok', false, 'error', 'meses_invalidos');
  END IF;

  SELECT * INTO pay FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF pay.status = 'paid' THEN
    RETURN json_build_object('ok', true, 'idempotent', true, 'payment_id', pay.id);
  END IF;

  IF pay.tenant_subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_sem_assinatura');
  END IF;

  SELECT * INTO sub FROM public.tenant_subscriptions WHERE id = pay.tenant_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  IF sub.status = 'canceled' THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_cancelada');
  END IF;

  SELECT * INTO plan FROM public.plans WHERE id = sub.plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'paid',
    paid_at = COALESCE(pay.paid_at, now()),
    gateway_provider = 'mercado_pago'
  WHERE id = pay.id;

  base_end := COALESCE(sub.current_period_end, now());
  IF base_end < now() THEN base_end := now(); END IF;
  new_end := base_end + make_interval(months => p_months);

  UPDATE public.tenant_subscriptions
  SET
    status = 'active',
    current_period_start = COALESCE(sub.current_period_start, now()),
    current_period_end = new_end,
    updated_at = now()
  WHERE id = sub.id;

  UPDATE public.companies SET status = 'active' WHERE id = sub.company_id;

  INSERT INTO public.payment_transactions (
    company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
  )
  VALUES (
    sub.company_id, sub.id, plan.price, 'pending', 'manual', (new_end::date), 'manual'
  )
  RETURNING id INTO next_payment_id;

  RETURN json_build_object(
    'ok', true,
    'subscription_id', sub.id,
    'payment_id', pay.id,
    'new_period_end', new_end,
    'next_payment_id', next_payment_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

REVOKE ALL ON FUNCTION public.service_apply_payment_renewal(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_apply_payment_renewal(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.service_mark_payment_rejected(
  p_payment_id uuid,
  p_mp_payment_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payment_transactions%ROWTYPE;
BEGIN
  IF (SELECT auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'payment_id_obrigatorio');
  END IF;

  SELECT * INTO pay FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF pay.status = 'paid' THEN
    RETURN json_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'failed'::public.payment_status,
    gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'mp_payment_id', p_mp_payment_id,
      'rejected_at', to_jsonb(now())
    ))
  WHERE id = pay.id;

  UPDATE public.tenant_subscriptions
  SET status = 'past_due'::public.subscription_status, updated_at = now()
  WHERE id = pay.tenant_subscription_id;

  UPDATE public.companies
  SET status = 'suspended'::public.company_status
  WHERE id = pay.company_id;

  RETURN json_build_object('ok', true, 'payment_id', pay.id);
END;
$$;

REVOKE ALL ON FUNCTION public.service_mark_payment_rejected(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_mark_payment_rejected(uuid, text) TO service_role;

COMMENT ON FUNCTION public.service_apply_payment_renewal(uuid, integer) IS 'Webhook MP: confirma pagamento e renova (service_role).';
COMMENT ON FUNCTION public.service_mark_payment_rejected(uuid, text) IS 'Webhook MP: pagamento recusado/cancelado — suspende empresa (service_role).';

COMMIT;
