-- Recusa de pagamento no gateway: apenas marca a transação como falha.
-- Não suspende a empresa nem força past_due na assinatura (evita bloqueio por tentativa negada).

BEGIN;

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

  RETURN json_build_object('ok', true, 'payment_id', pay.id);
END;
$$;

COMMENT ON FUNCTION public.service_mark_payment_rejected(uuid, text) IS 'Webhook MP: pagamento recusado/cancelado — apenas marca transação (service_role). Não suspende tenant.';

COMMIT;
