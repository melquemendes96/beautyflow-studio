-- Sincronização Master → tenant_subscriptions (via app), pagamento simulado pela empresa,
-- onboarding_completed e bootstrap atualizado.

BEGIN;

-- ---------------------------------------------------------------------------
-- companies.onboarding_completed
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Empresas já existentes: não forçar onboarding de novo
UPDATE public.companies SET onboarding_completed = true WHERE onboarding_completed IS NOT TRUE;

COMMENT ON COLUMN public.companies.onboarding_completed IS
  'Quando false, o painel sugere concluir configuração inicial (marca, agenda, serviços).';

-- ---------------------------------------------------------------------------
-- Bootstrap: novas empresas self-serve começam com onboarding pendente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_bootstrap_company(
  p_company_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_name text;
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_try int := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('ok', true, 'company_id', v_company_id, 'existing', true);
  END IF;

  v_name := nullif(trim(coalesce(p_company_name, '')), '');
  IF v_name IS NULL THEN
    v_name := 'Meu Studio';
  END IF;

  v_base_slug := nullif(public.slugify_basic(v_name), '');
  IF v_base_slug IS NULL THEN
    v_base_slug := 'meu-studio';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_suffix := lpad((floor(random() * 10000))::int::text, 4, '0');
    v_slug := CASE WHEN v_try = 1 THEN v_base_slug ELSE v_base_slug || '-' || v_suffix END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.companies WHERE slug = v_slug);
    EXIT WHEN v_try >= 10;
  END LOOP;

  INSERT INTO public.companies (name, slug, status, onboarding_completed)
  VALUES (v_name, v_slug, 'active'::public.company_status, false)
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_users (company_id, user_id, role)
  VALUES (v_company_id, v_user_id, 'owner'::public.company_user_role);

  RETURN json_build_object('ok', true, 'company_id', v_company_id, 'slug', v_slug, 'existing', false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

-- ---------------------------------------------------------------------------
-- Empresa (owner/admin): simular resultado de pagamento (demo / manual)
-- ---------------------------------------------------------------------------
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

COMMENT ON FUNCTION public.company_simulate_payment_outcome(uuid, text) IS
  'Demo/manual: owner/admin da empresa resolve cobrança pendente (approved / pending / failed). Gateway real usará webhooks.';

-- ---------------------------------------------------------------------------
-- Marcar onboarding concluído (exige ao menos 1 serviço ativo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_mark_onboarding_complete()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
  v_count int;
BEGIN
  SELECT cu.company_id INTO v_cid
  FROM public.company_users cu
  WHERE cu.user_id = auth.uid()
    AND cu.role IN ('owner'::public.company_user_role, 'admin'::public.company_user_role)
  ORDER BY cu.created_at ASC
  LIMIT 1;

  IF v_cid IS NULL THEN
    SELECT cu.company_id INTO v_cid
    FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
    ORDER BY cu.created_at ASC
    LIMIT 1;
  END IF;

  IF v_cid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'sem_empresa');
  END IF;

  IF NOT (v_cid IN (SELECT public.current_user_owner_admin_company_ids())) THEN
    RETURN json_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.services s
  WHERE s.company_id = v_cid AND s.active = true;

  IF v_count < 1 THEN
    RETURN json_build_object('ok', false, 'error', 'cadastre_um_servico');
  END IF;

  UPDATE public.companies
  SET onboarding_completed = true, updated_at = now()
  WHERE id = v_cid;

  RETURN json_build_object('ok', true, 'company_id', v_cid);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

REVOKE ALL ON FUNCTION public.company_mark_onboarding_complete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_mark_onboarding_complete() TO authenticated;

COMMIT;
