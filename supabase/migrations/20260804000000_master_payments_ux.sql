-- Melhora master payments: opção de não gerar próxima fatura + excluir pendente.

BEGIN;

CREATE OR REPLACE FUNCTION public.master_apply_payment(
  p_payment_id uuid,
  p_months integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.master_apply_payment(p_payment_id, p_months, false, true);
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
BEGIN
  RETURN public.master_apply_payment(p_payment_id, p_months, p_allow_canceled, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.master_apply_payment(
  p_payment_id uuid,
  p_months integer,
  p_allow_canceled boolean,
  p_create_next_invoice boolean
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
  next_amount numeric(12, 2);
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

  IF pay.status = 'paid'::public.payment_status THEN
    RETURN json_build_object(
      'ok', true,
      'already_paid', true,
      'payment_id', pay.id,
      'subscription_id', pay.tenant_subscription_id,
      'new_period_end', (
        SELECT ts.current_period_end
        FROM public.tenant_subscriptions ts
        WHERE ts.id = pay.tenant_subscription_id
      )
    );
  END IF;

  IF pay.tenant_subscription_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_sem_assinatura');
  END IF;

  SELECT * INTO sub FROM public.tenant_subscriptions WHERE id = pay.tenant_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_nao_encontrada');
  END IF;

  IF sub.status = 'canceled'::public.subscription_status
     AND coalesce(p_allow_canceled, false) = false THEN
    RETURN json_build_object('ok', false, 'error', 'assinatura_cancelada');
  END IF;

  SELECT * INTO plan FROM public.plans WHERE id = sub.plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'plano_nao_encontrado');
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'paid'::public.payment_status,
    paid_at = COALESCE(pay.paid_at, now())
  WHERE id = pay.id;

  base_end := COALESCE(sub.current_period_end, now());
  IF base_end < now() THEN
    base_end := now();
  END IF;
  new_end := base_end + make_interval(months => p_months);

  UPDATE public.tenant_subscriptions
  SET
    status = 'active'::public.subscription_status,
    current_period_start = COALESCE(sub.current_period_start, now()),
    current_period_end = new_end,
    updated_at = now()
  WHERE id = sub.id;

  UPDATE public.companies
  SET status = 'active'::public.company_status
  WHERE id = sub.company_id;

  IF coalesce(p_create_next_invoice, false) THEN
    next_amount := COALESCE(plan.price, pay.amount, 0);

    SELECT pt.id
    INTO next_payment_id
    FROM public.payment_transactions pt
    WHERE pt.tenant_subscription_id = sub.id
      AND pt.status = 'pending'::public.payment_status
      AND pt.id IS DISTINCT FROM pay.id
      AND pt.due_date IS NOT DISTINCT FROM (new_end::date)
    ORDER BY pt.created_at DESC
    LIMIT 1;

    IF next_payment_id IS NULL THEN
      INSERT INTO public.payment_transactions (
        company_id, tenant_subscription_id, amount, status, payment_method, due_date, gateway_provider
      )
      VALUES (
        sub.company_id,
        sub.id,
        next_amount,
        'pending'::public.payment_status,
        'manual',
        (new_end::date),
        'manual'
      )
      RETURNING id INTO next_payment_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'subscription_id', sub.id,
    'payment_id', pay.id,
    'new_period_end', new_end,
    'next_payment_id', next_payment_id,
    'created_next_invoice', coalesce(p_create_next_invoice, false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'erro_interno',
      'detail', SQLERRM
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.master_delete_pending_payment(p_payment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payment_transactions%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'payment_id_obrigatorio');
  END IF;

  SELECT * INTO pay FROM public.payment_transactions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'pagamento_nao_encontrado');
  END IF;

  IF pay.status = 'paid'::public.payment_status THEN
    RETURN json_build_object('ok', false, 'error', 'nao_pode_excluir_pago');
  END IF;

  DELETE FROM public.payment_transactions WHERE id = pay.id;

  RETURN json_build_object('ok', true, 'payment_id', pay.id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno', 'detail', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.master_apply_payment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_apply_payment(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_apply_payment(uuid, integer, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_delete_pending_payment(uuid) TO authenticated;

COMMENT ON FUNCTION public.master_apply_payment(uuid, integer, boolean, boolean) IS
  'Master: marca pago, renova assinatura; p_create_next_invoice controla se gera próxima cobrança.';

COMMENT ON FUNCTION public.master_delete_pending_payment(uuid) IS
  'Master: remove cobrança não paga (pendente/falhou) para limpar duplicatas.';

COMMIT;
