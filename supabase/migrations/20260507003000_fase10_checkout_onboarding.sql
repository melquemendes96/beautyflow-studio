-- Fase 10 (checkout/onboarding) — pedido de assinatura + perfil de cobrança
-- Importante: NÃO armazenamos dados sensíveis de cartão no banco.
-- Pagamento online via gateway (ex.: Mercado Pago) nas fases seguintes ao schema base.

BEGIN;

-- Preferência de forma de pagamento (apenas intenção)
DO $$
BEGIN
  CREATE TYPE public.payment_method_preference AS ENUM (
    'pix',
    'credit_card',
    'debit_card',
    'boleto',
    'manual_transfer'
  );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- Perfil de cobrança (1 por empresa)
CREATE TABLE IF NOT EXISTS public.billing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies (id) ON DELETE CASCADE,
  legal_name TEXT,
  document TEXT, -- CPF/CNPJ (string)
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'BR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_billing_profiles_updated_at
  BEFORE UPDATE ON public.billing_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.billing_profiles ENABLE ROW LEVEL SECURITY;

-- owner/admin da empresa podem ver/editar o próprio perfil
CREATE POLICY billing_profiles_select
  ON public.billing_profiles FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY billing_profiles_upsert
  ON public.billing_profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY billing_profiles_update
  ON public.billing_profiles FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

-- RPC: inicia checkout (cria/atualiza subscription + cria cobrança pendente + cria ticket)
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
  sub_row public.subscriptions%ROWTYPE;
  pay_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_plan_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  -- valida permissão (owner/admin)
  IF NOT (p_company_id IN (SELECT public.current_user_owner_admin_company_ids())) THEN
    RETURN json_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT * INTO plan_row FROM public.plans WHERE id = p_plan_id AND active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_invalido');
  END IF;

  -- upsert perfil de cobrança
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

  -- garante subscription (1 por empresa)
  SELECT * INTO sub_row FROM public.subscriptions WHERE company_id = p_company_id;
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end)
    VALUES (
      p_company_id,
      p_plan_id,
      CASE WHEN p_trial THEN 'trialing'::public.subscription_status ELSE 'past_due'::public.subscription_status END,
      now(),
      CASE WHEN p_trial THEN now() + interval '14 days' ELSE NULL END
    )
    RETURNING * INTO sub_row;
  ELSE
    UPDATE public.subscriptions
    SET
      plan_id = p_plan_id,
      status = CASE WHEN p_trial THEN 'trialing'::public.subscription_status ELSE sub_row.status END
    WHERE id = sub_row.id
    RETURNING * INTO sub_row;
  END IF;

  -- cria cobrança pendente se não for trial
  IF NOT p_trial THEN
    INSERT INTO public.payments (company_id, subscription_id, amount, status, payment_method, due_date)
    VALUES (
      p_company_id,
      sub_row.id,
      plan_row.price,
      'pending'::public.payment_status,
      p_payment_method::text,
      (now()::date + 3)
    )
    RETURNING id INTO pay_id;
  END IF;

  -- cria ticket para master (financeiro)
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

COMMENT ON FUNCTION public.company_start_checkout IS 'Fase 10: inicia checkout da empresa (perfil + subscription + cobrança pendente + ticket). Não armazena dados sensíveis.';

COMMIT;

