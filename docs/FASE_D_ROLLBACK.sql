-- Rollback Fase D — restaurar simulação de pagamento para owner/admin da empresa (pré-D).
-- Executar no SQL Editor apenas se necessário reverter a etapa 1.

BEGIN;

CREATE OR REPLACE FUNCTION public.company_simulate_payment_outcome(
  p_payment_id uuid,
  p_outcome text
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
  outcome_norm text;
BEGIN
  IF p_payment_id IS NULL OR p_outcome IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  outcome_norm := lower(trim(p_outcome));

  SELECT * INTO pay FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF NOT (pay.company_id IN (SELECT public.current_user_owner_admin_company_ids())) THEN
    RETURN json_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  IF pay.tenant_subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_sem_assinatura');
  END IF;

  SELECT * INTO sub FROM public.tenant_subscriptions WHERE id = pay.tenant_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  IF outcome_norm = 'pending' THEN
    UPDATE public.payment_transactions SET status = 'pending'::public.payment_status WHERE id = pay.id;
    RETURN json_build_object('ok', true, 'outcome', 'pending');
  END IF;

  IF outcome_norm = 'failed' THEN
    UPDATE public.payment_transactions SET status = 'failed'::public.payment_status WHERE id = pay.id;
    UPDATE public.tenant_subscriptions
    SET status = 'past_due'::public.subscription_status, updated_at = now()
    WHERE id = sub.id;
    RETURN json_build_object('ok', true, 'outcome', 'failed');
  END IF;

  IF outcome_norm <> 'approved' THEN
    RETURN json_build_object('ok', false, 'error', 'resultado_invalido');
  END IF;

  IF pay.status = 'paid'::public.payment_status THEN
    RETURN json_build_object('ok', true, 'outcome', 'already_paid');
  END IF;

  SELECT * INTO plan FROM public.plans WHERE id = sub.plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  UPDATE public.payment_transactions
  SET status = 'paid'::public.payment_status, paid_at = COALESCE(pay.paid_at, now())
  WHERE id = pay.id;

  base_end := now();
  new_end := base_end + interval '30 days';

  UPDATE public.tenant_subscriptions
  SET
    status = 'active'::public.subscription_status,
    current_period_start = base_end,
    current_period_end = new_end,
    updated_at = now()
  WHERE id = sub.id;

  UPDATE public.companies SET status = 'active'::public.company_status WHERE id = sub.company_id;

  INSERT INTO public.payment_transactions (
    company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
  )
  VALUES (
    sub.company_id, sub.id, plan.price, 'pending'::public.payment_status, 'manual', (new_end::date), 'manual'
  )
  RETURNING id INTO next_payment_id;

  RETURN json_build_object(
    'ok', true,
    'outcome', 'approved',
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

REVOKE ALL ON FUNCTION public.company_simulate_payment_outcome(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_simulate_payment_outcome(uuid, text) TO authenticated;

COMMIT;

-- Front/Edge: reverter commits da Fase D e redeploy manualmente.
