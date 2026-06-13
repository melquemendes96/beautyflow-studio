-- Gestão Financeira (feature finance): despesas manuais, DRE automática, fluxo de caixa.
-- Comissões na DRE entram somente quando repasse status = paid (paid_at no período).

BEGIN;

-- ---------------------------------------------------------------------------
-- Feature catalog — evoluir chave finance existente
-- ---------------------------------------------------------------------------
INSERT INTO public.features_catalog (key, name, description, category)
VALUES (
  'finance',
  'Gestão Financeira',
  'DRE automática, despesas fixas/variáveis, pró-labore, fluxo de caixa e exportação para contador',
  'premium'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- ---------------------------------------------------------------------------
-- Lançamentos financeiros manuais
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('fixed', 'variable', 'prolabore', 'tax', 'other')),
  category text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  entry_date date NOT NULL,
  paid_at timestamptz,
  is_paid boolean NOT NULL DEFAULT true,
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly', 'yearly')),
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_date
  ON public.financial_entries (company_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_paid
  ON public.financial_entries (company_id, paid_at DESC)
  WHERE is_paid = true;

DROP TRIGGER IF EXISTS trg_financial_entries_updated_at ON public.financial_entries;
CREATE TRIGGER trg_financial_entries_updated_at
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_entries_select ON public.financial_entries;
CREATE POLICY financial_entries_select ON public.financial_entries
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(company_id, 'finance')
    )
  );

DROP POLICY IF EXISTS financial_entries_write ON public.financial_entries;
CREATE POLICY financial_entries_write ON public.financial_entries
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(company_id, 'finance')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(company_id, 'finance')
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_manage_financial(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR (
      p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
      AND public.company_has_plan_feature(p_company_id, 'finance')
    );
$$;

CREATE OR REPLACE FUNCTION public._financial_period_bounds(p_start date, p_end date)
RETURNS TABLE (ts_start timestamptz, ts_end_exclusive timestamptz)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_start::timestamptz,
    (p_end + 1)::timestamptz;
$$;

-- ---------------------------------------------------------------------------
-- CRUD lançamentos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_financial_entries(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'entry_type', e.entry_type,
      'category', e.category,
      'description', e.description,
      'amount', e.amount,
      'entry_date', e.entry_date,
      'paid_at', e.paid_at,
      'is_paid', e.is_paid,
      'recurrence', e.recurrence,
      'notes', e.notes,
      'created_at', e.created_at
    ) ORDER BY e.entry_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_rows
  FROM public.financial_entries e
  WHERE e.company_id = p_company_id
    AND (p_start_date IS NULL OR e.entry_date >= p_start_date)
    AND (p_end_date IS NULL OR e.entry_date <= p_end_date);

  RETURN jsonb_build_object('ok', true, 'entries', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_financial_entry(
  p_company_id uuid,
  p_entry_id uuid DEFAULT NULL,
  p_entry_type text DEFAULT 'fixed',
  p_category text DEFAULT '',
  p_description text DEFAULT '',
  p_amount numeric DEFAULT 0,
  p_entry_date date DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL,
  p_is_paid boolean DEFAULT true,
  p_recurrence text DEFAULT 'none',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_date date := COALESCE(p_entry_date, CURRENT_DATE);
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valor_invalido');
  END IF;

  IF p_entry_type NOT IN ('fixed', 'variable', 'prolabore', 'tax', 'other') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  END IF;

  IF p_recurrence NOT IN ('none', 'monthly', 'yearly') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recorrencia_invalida');
  END IF;

  IF p_entry_id IS NULL THEN
    INSERT INTO public.financial_entries (
      company_id, entry_type, category, description, amount,
      entry_date, paid_at, is_paid, recurrence, notes, created_by
    ) VALUES (
      p_company_id, p_entry_type, COALESCE(p_category, ''), COALESCE(p_description, ''),
      p_amount, v_date,
      CASE WHEN p_is_paid THEN COALESCE(p_paid_at, now()) ELSE p_paid_at END,
      COALESCE(p_is_paid, true), COALESCE(p_recurrence, 'none'), p_notes,
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.financial_entries SET
      entry_type = p_entry_type,
      category = COALESCE(p_category, ''),
      description = COALESCE(p_description, ''),
      amount = p_amount,
      entry_date = v_date,
      paid_at = CASE WHEN COALESCE(p_is_paid, is_paid) THEN COALESCE(p_paid_at, paid_at, now()) ELSE p_paid_at END,
      is_paid = COALESCE(p_is_paid, is_paid),
      recurrence = COALESCE(p_recurrence, recurrence),
      notes = p_notes
    WHERE id = p_entry_id AND company_id = p_company_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_financial_entry(
  p_company_id uuid,
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM public.financial_entries
  WHERE id = p_entry_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Agregadores internos (receita, CMV, comissões pagas, despesas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._financial_revenue_services(
  p_company_id uuid,
  p_start date,
  p_end date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(l.line_total), 0)::numeric
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  CROSS JOIN public._financial_period_bounds(p_start, p_end) b
  WHERE t.company_id = p_company_id
    AND t.status = 'closed'
    AND t.closed_at >= b.ts_start
    AND t.closed_at < b.ts_end_exclusive
    AND l.line_type IN ('service', 'service_extra');
$$;

CREATE OR REPLACE FUNCTION public._financial_revenue_products(
  p_company_id uuid,
  p_start date,
  p_end date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(l.line_total), 0)::numeric
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  CROSS JOIN public._financial_period_bounds(p_start, p_end) b
  WHERE t.company_id = p_company_id
    AND t.status = 'closed'
    AND t.closed_at >= b.ts_start
    AND t.closed_at < b.ts_end_exclusive
    AND l.line_type = 'product';
$$;

CREATE OR REPLACE FUNCTION public._financial_cogs_products(
  p_company_id uuid,
  p_start date,
  p_end date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(l.quantity * p.cost_price), 0)::numeric
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  JOIN public.products p ON p.id = l.product_id
  CROSS JOIN public._financial_period_bounds(p_start, p_end) b
  WHERE t.company_id = p_company_id
    AND t.status = 'closed'
    AND t.closed_at >= b.ts_start
    AND t.closed_at < b.ts_end_exclusive
    AND l.line_type = 'product';
$$;

CREATE OR REPLACE FUNCTION public._financial_cogs_consumables(
  p_company_id uuid,
  p_start date,
  p_end date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(ABS(sm.quantity) * p.cost_price), 0)::numeric
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  CROSS JOIN public._financial_period_bounds(p_start, p_end) b
  WHERE sm.company_id = p_company_id
    AND sm.movement_type = 'consumption'
    AND sm.created_at >= b.ts_start
    AND sm.created_at < b.ts_end_exclusive;
$$;

CREATE OR REPLACE FUNCTION public._financial_commissions_paid(
  p_company_id uuid,
  p_start date,
  p_end date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(pp.amount), 0)::numeric
  FROM public.provider_payouts pp
  CROSS JOIN public._financial_period_bounds(p_start, p_end) b
  WHERE pp.company_id = p_company_id
    AND pp.status = 'paid'
    AND pp.paid_at IS NOT NULL
    AND pp.paid_at >= b.ts_start
    AND pp.paid_at < b.ts_end_exclusive;
$$;

CREATE OR REPLACE FUNCTION public._financial_expenses_by_type(
  p_company_id uuid,
  p_start date,
  p_end date,
  p_entry_type text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(e.amount), 0)::numeric
  FROM public.financial_entries e
  WHERE e.company_id = p_company_id
    AND e.entry_type = p_entry_type
    AND e.entry_date >= p_start
    AND e.entry_date <= p_end;
$$;

-- ---------------------------------------------------------------------------
-- DRE principal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_financial_dre(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rev_services numeric;
  v_rev_products numeric;
  v_rev_total numeric;
  v_cogs_products numeric;
  v_cogs_consumables numeric;
  v_cogs_total numeric;
  v_gross_profit numeric;
  v_commissions numeric;
  v_fixed numeric;
  v_variable numeric;
  v_operating numeric;
  v_prolabore numeric;
  v_tax numeric;
  v_other numeric;
  v_net numeric;
  v_margin numeric;
  v_lines jsonb;
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'periodo_invalido');
  END IF;

  v_rev_services := public._financial_revenue_services(p_company_id, p_start_date, p_end_date);
  v_rev_products := public._financial_revenue_products(p_company_id, p_start_date, p_end_date);
  v_rev_total := v_rev_services + v_rev_products;

  v_cogs_products := public._financial_cogs_products(p_company_id, p_start_date, p_end_date);
  v_cogs_consumables := public._financial_cogs_consumables(p_company_id, p_start_date, p_end_date);
  v_cogs_total := v_cogs_products + v_cogs_consumables;

  v_gross_profit := v_rev_total - v_cogs_total;

  v_commissions := public._financial_commissions_paid(p_company_id, p_start_date, p_end_date);
  v_fixed := public._financial_expenses_by_type(p_company_id, p_start_date, p_end_date, 'fixed');
  v_variable := public._financial_expenses_by_type(p_company_id, p_start_date, p_end_date, 'variable');
  v_prolabore := public._financial_expenses_by_type(p_company_id, p_start_date, p_end_date, 'prolabore');
  v_tax := public._financial_expenses_by_type(p_company_id, p_start_date, p_end_date, 'tax');
  v_other := public._financial_expenses_by_type(p_company_id, p_start_date, p_end_date, 'other');

  v_operating := v_gross_profit - v_commissions - v_fixed - v_variable - v_other;
  v_net := v_operating - v_prolabore - v_tax;

  IF v_rev_total > 0 THEN
    v_margin := ROUND((v_net / v_rev_total) * 100, 1);
  ELSE
    v_margin := 0;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('key', 'revenue_services', 'label', 'Receita de serviços', 'amount', v_rev_services, 'kind', 'credit', 'level', 1, 'parent', 'revenue'),
    jsonb_build_object('key', 'revenue_products', 'label', 'Receita de produtos', 'amount', v_rev_products, 'kind', 'credit', 'level', 1, 'parent', 'revenue'),
    jsonb_build_object('key', 'revenue', 'label', 'Receita bruta', 'amount', v_rev_total, 'kind', 'credit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'cogs_products', 'label', 'CMV — produtos vendidos', 'amount', v_cogs_products, 'kind', 'debit', 'level', 1, 'parent', 'cogs'),
    jsonb_build_object('key', 'cogs_consumables', 'label', 'CMV — insumos/consumíveis', 'amount', v_cogs_consumables, 'kind', 'debit', 'level', 1, 'parent', 'cogs'),
    jsonb_build_object('key', 'cogs', 'label', '(-) Custo das mercadorias (CMV)', 'amount', v_cogs_total, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'gross_profit', 'label', 'Lucro bruto', 'amount', v_gross_profit, 'kind', 'subtotal', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'commissions_paid', 'label', '(-) Comissões pagas (repasses)', 'amount', v_commissions, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'expenses_fixed', 'label', '(-) Despesas fixas', 'amount', v_fixed, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'expenses_variable', 'label', '(-) Despesas variáveis', 'amount', v_variable, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'expenses_other', 'label', '(-) Outras despesas', 'amount', v_other, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'operating_result', 'label', 'Resultado operacional', 'amount', v_operating, 'kind', 'subtotal', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'prolabore', 'label', '(-) Pró-labore', 'amount', v_prolabore, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'tax', 'label', '(-) Impostos e taxas', 'amount', v_tax, 'kind', 'debit', 'level', 0, 'parent', null),
    jsonb_build_object('key', 'net_result', 'label', 'Resultado líquido', 'amount', v_net, 'kind', 'total', 'level', 0, 'parent', null)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'revenue', jsonb_build_object(
      'services', v_rev_services,
      'products', v_rev_products,
      'total', v_rev_total
    ),
    'cogs', jsonb_build_object(
      'products', v_cogs_products,
      'consumables', v_cogs_consumables,
      'total', v_cogs_total
    ),
    'gross_profit', v_gross_profit,
    'commissions_paid', v_commissions,
    'expenses', jsonb_build_object(
      'fixed', v_fixed,
      'variable', v_variable,
      'prolabore', v_prolabore,
      'tax', v_tax,
      'other', v_other,
      'total', v_fixed + v_variable + v_prolabore + v_tax + v_other
    ),
    'operating_result', v_operating,
    'net_result', v_net,
    'margin_pct', v_margin,
    'lines', v_lines,
    'commissions_basis', 'paid_at'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Fluxo de caixa (regime caixa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_financial_cash_flow(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_inflows numeric;
  v_out_commissions numeric;
  v_out_expenses numeric;
  v_net numeric;
  v_by_method jsonb;
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'periodo_invalido');
  END IF;

  SELECT * INTO b FROM public._financial_period_bounds(p_start_date, p_end_date);

  SELECT COALESCE(SUM(t.total), 0) INTO v_inflows
  FROM public.client_tabs t
  WHERE t.company_id = p_company_id
    AND t.status = 'closed'
    AND t.closed_at >= b.ts_start
    AND t.closed_at < b.ts_end_exclusive;

  SELECT COALESCE(jsonb_object_agg(method, total), '{}'::jsonb)
  INTO v_by_method
  FROM (
    SELECT COALESCE(t.payment_method, 'outro') AS method, SUM(t.total)::numeric AS total
    FROM public.client_tabs t
    WHERE t.company_id = p_company_id
      AND t.status = 'closed'
      AND t.closed_at >= b.ts_start
      AND t.closed_at < b.ts_end_exclusive
    GROUP BY 1
  ) s;

  v_out_commissions := public._financial_commissions_paid(p_company_id, p_start_date, p_end_date);

  SELECT COALESCE(SUM(e.amount), 0) INTO v_out_expenses
  FROM public.financial_entries e
  WHERE e.company_id = p_company_id
    AND e.is_paid = true
    AND e.paid_at IS NOT NULL
    AND e.paid_at >= b.ts_start
    AND e.paid_at < b.ts_end_exclusive;

  v_net := v_inflows - v_out_commissions - v_out_expenses;

  RETURN jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'inflows', v_inflows,
    'inflows_by_method', v_by_method,
    'outflows', jsonb_build_object(
      'commissions', v_out_commissions,
      'expenses', v_out_expenses,
      'total', v_out_commissions + v_out_expenses
    ),
    'net_cash', v_net
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Tendência mensal (gráficos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_financial_trend(
  p_company_id uuid,
  p_months int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months int := GREATEST(1, LEAST(COALESCE(p_months, 6), 24));
  v_rows jsonb;
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'month'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'month', to_char(m.month_start, 'YYYY-MM'),
      'label', trim(to_char(m.month_start, 'TMMonth YYYY')),
      'revenue', public._financial_revenue_services(p_company_id, m.month_start, m.month_end)
        + public._financial_revenue_products(p_company_id, m.month_start, m.month_end),
      'expenses', public._financial_commissions_paid(p_company_id, m.month_start, m.month_end)
        + public._financial_expenses_by_type(p_company_id, m.month_start, m.month_end, 'fixed')
        + public._financial_expenses_by_type(p_company_id, m.month_start, m.month_end, 'variable')
        + public._financial_expenses_by_type(p_company_id, m.month_start, m.month_end, 'prolabore')
        + public._financial_expenses_by_type(p_company_id, m.month_start, m.month_end, 'tax')
        + public._financial_expenses_by_type(p_company_id, m.month_start, m.month_end, 'other')
        + public._financial_cogs_products(p_company_id, m.month_start, m.month_end)
        + public._financial_cogs_consumables(p_company_id, m.month_start, m.month_end),
      'net_result', (
        SELECT (d->>'net_result')::numeric
        FROM public.company_financial_dre(p_company_id, m.month_start, m.month_end) d
        WHERE d->>'ok' = 'true'
      )
    ) AS row
    FROM (
      SELECT
        (date_trunc('month', CURRENT_DATE) - ((g.i || ' months')::interval))::date AS month_start,
        ((date_trunc('month', CURRENT_DATE) - ((g.i || ' months')::interval)) + interval '1 month - 1 day')::date AS month_end
      FROM generate_series(v_months - 1, 0, -1) AS g(i)
    ) m
  ) sub;

  RETURN jsonb_build_object('ok', true, 'months', v_rows);
END;
$$;

-- ---------------------------------------------------------------------------
-- Drill-down por linha da DRE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_financial_drill_down(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_line_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_items jsonb;
BEGIN
  IF NOT public.user_can_manage_financial(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO b FROM public._financial_period_bounds(p_start_date, p_end_date);

  IF p_line_key IN ('revenue_services', 'revenue') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', t.closed_at,
      'description', l.description,
      'amount', l.line_total,
      'reference', t.id,
      'reference_type', 'comanda'
    ) ORDER BY t.closed_at DESC), '[]'::jsonb)
    INTO v_items
    FROM public.client_tab_lines l
    JOIN public.client_tabs t ON t.id = l.tab_id
    WHERE t.company_id = p_company_id
      AND t.status = 'closed'
      AND t.closed_at >= b.ts_start AND t.closed_at < b.ts_end_exclusive
      AND l.line_type IN ('service', 'service_extra')
      AND (p_line_key = 'revenue_services' OR p_line_key = 'revenue');
  ELSIF p_line_key = 'revenue_products' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', t.closed_at,
      'description', l.description,
      'amount', l.line_total,
      'reference', t.id,
      'reference_type', 'comanda'
    ) ORDER BY t.closed_at DESC), '[]'::jsonb)
    INTO v_items
    FROM public.client_tab_lines l
    JOIN public.client_tabs t ON t.id = l.tab_id
    WHERE t.company_id = p_company_id
      AND t.status = 'closed'
      AND t.closed_at >= b.ts_start AND t.closed_at < b.ts_end_exclusive
      AND l.line_type = 'product';
  ELSIF p_line_key = 'commissions_paid' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', pp.paid_at,
      'description', COALESCE(sp.display_name, 'Prestador') || ' — repasse',
      'amount', pp.amount,
      'reference', pp.id,
      'reference_type', 'repasse'
    ) ORDER BY pp.paid_at DESC), '[]'::jsonb)
    INTO v_items
    FROM public.provider_payouts pp
    LEFT JOIN public.service_providers sp ON sp.id = pp.provider_id
    WHERE pp.company_id = p_company_id
      AND pp.status = 'paid'
      AND pp.paid_at >= b.ts_start AND pp.paid_at < b.ts_end_exclusive;
  ELSIF p_line_key IN ('expenses_fixed', 'expenses_variable', 'prolabore', 'tax', 'expenses_other') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', e.entry_date,
      'description', COALESCE(NULLIF(e.description, ''), e.category),
      'amount', e.amount,
      'reference', e.id,
      'reference_type', 'lancamento'
    ) ORDER BY e.entry_date DESC), '[]'::jsonb)
    INTO v_items
    FROM public.financial_entries e
    WHERE e.company_id = p_company_id
      AND e.entry_date >= p_start_date AND e.entry_date <= p_end_date
      AND e.entry_type = CASE p_line_key
        WHEN 'expenses_fixed' THEN 'fixed'
        WHEN 'expenses_variable' THEN 'variable'
        WHEN 'prolabore' THEN 'prolabore'
        WHEN 'tax' THEN 'tax'
        WHEN 'expenses_other' THEN 'other'
        ELSE e.entry_type
      END;
  ELSIF p_line_key = 'cogs_products' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', t.closed_at,
      'description', l.description || ' (custo)',
      'amount', l.quantity * p.cost_price,
      'reference', l.id,
      'reference_type', 'cmv_produto'
    ) ORDER BY t.closed_at DESC), '[]'::jsonb)
    INTO v_items
    FROM public.client_tab_lines l
    JOIN public.client_tabs t ON t.id = l.tab_id
    JOIN public.products p ON p.id = l.product_id
    WHERE t.company_id = p_company_id
      AND t.status = 'closed'
      AND t.closed_at >= b.ts_start AND t.closed_at < b.ts_end_exclusive
      AND l.line_type = 'product';
  ELSIF p_line_key = 'cogs_consumables' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', sm.created_at,
      'description', p.name || ' — consumo',
      'amount', ABS(sm.quantity) * p.cost_price,
      'reference', sm.id,
      'reference_type', 'cmv_insumo'
    ) ORDER BY sm.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM public.stock_movements sm
    JOIN public.products p ON p.id = sm.product_id
    WHERE sm.company_id = p_company_id
      AND sm.movement_type = 'consumption'
      AND sm.created_at >= b.ts_start AND sm.created_at < b.ts_end_exclusive;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'linha_invalida');
  END IF;

  RETURN jsonb_build_object('ok', true, 'line_key', p_line_key, 'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.user_can_manage_financial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_financial_entries(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_financial_entry(uuid, uuid, text, text, text, numeric, date, timestamptz, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_financial_entry(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_financial_dre(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_financial_cash_flow(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_financial_trend(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_financial_drill_down(uuid, date, date, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_financial_entries(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_financial_entry(uuid, uuid, text, text, text, numeric, date, timestamptz, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_entry(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_financial_dre(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_financial_cash_flow(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_financial_trend(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_financial_drill_down(uuid, date, date, text) TO authenticated;

COMMIT;
