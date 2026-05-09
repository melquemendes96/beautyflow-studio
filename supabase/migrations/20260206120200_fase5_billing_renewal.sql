-- Fase 5.4 — Regras de renovação e MRR (RPC segura)
-- Objetivo: quando um pagamento é marcado como pago, renovar a assinatura e gerar a próxima cobrança.

-- RPC: master_apply_payment(payment_id, months)
-- - Permissão: apenas platform_admin (is_platform_admin())
-- - Efeitos:
--   1) atualiza payments.status='paid' + paid_at
--   2) define subscriptions.status='active'
--   3) estende current_period_end por N meses (a partir do maior entre now() e current_period_end)
--   4) gera um novo payment pendente com valor do plano e vencimento na data de renovação

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
  pay public.payments%ROWTYPE;
  sub public.subscriptions%ROWTYPE;
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

  SELECT *
  INTO pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF pay.subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_sem_assinatura');
  END IF;

  SELECT *
  INTO sub
  FROM public.subscriptions
  WHERE id = pay.subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  SELECT *
  INTO plan
  FROM public.plans
  WHERE id = sub.plan_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  UPDATE public.payments
  SET
    status = 'paid',
    paid_at = COALESCE(pay.paid_at, now())
  WHERE id = pay.id;

  base_end := COALESCE(sub.current_period_end, now());
  IF base_end < now() THEN
    base_end := now();
  END IF;

  new_end := base_end + make_interval(months => p_months);

  UPDATE public.subscriptions
  SET
    status = 'active',
    current_period_start = COALESCE(sub.current_period_start, now()),
    current_period_end = new_end,
    updated_at = now()
  WHERE id = sub.id;

  INSERT INTO public.payments (
    company_id,
    subscription_id,
    amount,
    status,
    payment_method,
    due_date
  )
  VALUES (
    sub.company_id,
    sub.id,
    plan.price,
    'pending',
    'manual',
    (new_end::date)
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

COMMENT ON FUNCTION public.master_apply_payment(uuid, integer) IS
  'Fase 5.4: marca pagamento como pago, renova assinatura e gera próxima cobrança (apenas platform_admin).';

