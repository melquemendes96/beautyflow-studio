-- Fase 10 — Regras do checkout
-- - Trial grátis: 7 dias
-- - Trial: 1 por empresa
-- - Troca de plano: a cada 30 dias

BEGIN;

-- Guardrails na subscription
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_plan_change_at TIMESTAMPTZ;

UPDATE public.subscriptions
SET last_plan_change_at = COALESCE(last_plan_change_at, created_at)
WHERE last_plan_change_at IS NULL;

-- Atualiza a RPC do checkout para aplicar as regras
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
  can_change_plan boolean;
BEGIN
  IF p_company_id IS NULL OR p_plan_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

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

  SELECT * INTO sub_row FROM public.subscriptions WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    -- primeira assinatura da empresa
    INSERT INTO public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end, trial_used, last_plan_change_at)
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
    -- regra: trial só 1x
    IF p_trial AND sub_row.trial_used THEN
      RETURN json_build_object('ok', false, 'error', 'trial_ja_usado');
    END IF;

    -- regra: troca de plano a cada 30 dias (exceto se for o mesmo plano)
    can_change_plan := (sub_row.plan_id = p_plan_id)
      OR (sub_row.last_plan_change_at IS NULL)
      OR (sub_row.last_plan_change_at <= now() - interval '30 days');

    IF NOT can_change_plan THEN
      RETURN json_build_object('ok', false, 'error', 'troca_plano_bloqueada');
    END IF;

    UPDATE public.subscriptions
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

COMMENT ON FUNCTION public.company_start_checkout IS 'Fase 10: aplica trial 7d (1x) e troca de plano a cada 30d.';

COMMIT;

