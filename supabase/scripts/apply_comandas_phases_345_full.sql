-- =============================================================================
-- JM BeautyFlow — Comandas Fases 3, 4 e 5 (produtos, caixa, repasses, consumíveis)
-- PRÉ-REQUISITOS: migrations 070–102 e 110–120 já aplicadas.
-- =============================================================================
-- Comandas Fases 3â€“5: produtos/estoque, caixa/repasses, consumÃ­veis automÃ¡ticos.

BEGIN;

-- ---------------------------------------------------------------------------
-- Feature flag: inventory
-- ---------------------------------------------------------------------------
INSERT INTO public.features_catalog (key, name, description, category)
VALUES (
  'inventory',
  'Produtos e estoque',
  'Cadastro de produtos, venda na comanda, controle de estoque e consumÃ­veis.',
  'elite'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, 'inventory', true
FROM public.plans p
WHERE lower(p.name) LIKE '%elite%'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS default_product_commission_pct numeric(5, 2);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  sale_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  cost_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  stock_quantity numeric(12, 3) NOT NULL DEFAULT 0,
  min_stock_quantity numeric(12, 3) NOT NULL DEFAULT 0,
  commission_pct numeric(5, 2),
  is_consumable boolean NOT NULL DEFAULT false,
  track_stock boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_company ON public.products (company_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku ON public.products (company_id, lower(sku))
  WHERE sku IS NOT NULL AND trim(sku) <> '';

ALTER TABLE public.client_tab_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id) ON DELETE SET NULL;

ALTER TABLE public.client_tabs
  ADD COLUMN IF NOT EXISTS cash_session_id uuid,
  ADD COLUMN IF NOT EXISTS product_sales_total numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_commission_total numeric(12, 2) NOT NULL DEFAULT 0;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment', 'sale', 'consumption', 'cancel')),
  quantity numeric(12, 3) NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.service_consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  quantity_per_service numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity_per_service > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_service_consumables_service ON public.service_consumables (service_id);

CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  opened_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_register_one_open
  ON public.cash_register_sessions (company_id)
  WHERE status = 'open';

CREATE TRIGGER trg_cash_register_sessions_updated_at
  BEFORE UPDATE ON public.cash_register_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.cash_register_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cash_register_sessions (id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  expected_amount numeric(12, 2) NOT NULL DEFAULT 0,
  counted_amount numeric(12, 2) NOT NULL DEFAULT 0,
  UNIQUE (session_id, payment_method)
);

ALTER TABLE public.client_tabs
  ADD CONSTRAINT client_tabs_cash_session_id_fkey
  FOREIGN KEY (cash_session_id) REFERENCES public.cash_register_sessions (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.provider_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  service_commission numeric(12, 2) NOT NULL DEFAULT 0,
  product_commission numeric(12, 2) NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_method text,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider ON public.provider_payouts (provider_id, created_at DESC);

CREATE TRIGGER trg_provider_payouts_updated_at
  BEFORE UPDATE ON public.provider_payouts
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_company ON public.products;
CREATE POLICY products_company ON public.products FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

DROP POLICY IF EXISTS stock_movements_company ON public.stock_movements;
CREATE POLICY stock_movements_company ON public.stock_movements FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

DROP POLICY IF EXISTS service_consumables_company ON public.service_consumables;
CREATE POLICY service_consumables_company ON public.service_consumables FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

DROP POLICY IF EXISTS cash_sessions_company ON public.cash_register_sessions;
CREATE POLICY cash_sessions_company ON public.cash_register_sessions FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

DROP POLICY IF EXISTS cash_counts_session ON public.cash_register_counts;
CREATE POLICY cash_counts_session ON public.cash_register_counts FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR session_id IN (
      SELECT s.id FROM public.cash_register_sessions s
      WHERE s.company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR session_id IN (
      SELECT s.id FROM public.cash_register_sessions s
      WHERE s.company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

DROP POLICY IF EXISTS provider_payouts_company ON public.provider_payouts;
CREATE POLICY provider_payouts_company ON public.provider_payouts FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR provider_id = public.current_user_provider_id_for_company(company_id)
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_has_inventory(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.company_has_plan_feature(p_company_id, 'inventory');
$$;

CREATE OR REPLACE FUNCTION public.product_line_commission(
  p_line_total numeric,
  p_product_commission_pct numeric,
  p_provider_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT round(
    (
      COALESCE(p_line_total, 0)
      * COALESCE(
          p_product_commission_pct,
          (
            SELECT COALESCE(sp.default_product_commission_pct, sp.default_commission_pct, 0)
            FROM public.service_providers sp
            WHERE sp.id = p_provider_id
          ),
          0
        )
      / 100.0
    )::numeric,
    2
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_company_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_new_qty numeric;
BEGIN
  IF p_quantity = 0 THEN
    RETURN json_build_object('ok', true);
  END IF;

  SELECT * INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id AND p.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'produto_nao_encontrado');
  END IF;

  IF NOT v_product.track_stock THEN
    RETURN json_build_object('ok', true, 'skipped', true);
  END IF;

  v_new_qty := v_product.stock_quantity + p_quantity;
  IF v_new_qty < 0 THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'estoque_insuficiente',
      'product_name', v_product.name,
      'available', v_product.stock_quantity
    );
  END IF;

  UPDATE public.products SET stock_quantity = v_new_qty, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO public.stock_movements (
    company_id, product_id, movement_type, quantity,
    reference_type, reference_id, notes, created_by
  )
  VALUES (
    p_company_id, p_product_id, p_movement_type, p_quantity,
    p_reference_type, p_reference_id, p_notes, auth.uid()
  );

  RETURN json_build_object('ok', true, 'stock_quantity', v_new_qty);
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_tab_product_totals(p_tab_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'product_sales', COALESCE(sum(l.line_total), 0),
    'product_commission', COALESCE(sum(
      public.product_line_commission(l.line_total, p.commission_pct, l.seller_provider_id)
    ), 0)
  )
  FROM public.client_tab_lines l
  LEFT JOIN public.products p ON p.id = l.product_id
  WHERE l.tab_id = p_tab_id
    AND l.line_type = 'product';
$$;

CREATE OR REPLACE FUNCTION public.finalize_tab_inventory(p_tab_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_line record;
  v_svc_id uuid;
  v_cons record;
  v_res json;
BEGIN
  IF NOT public.company_has_inventory(p_company_id) THEN
    RETURN json_build_object('ok', true);
  END IF;

  FOR v_line IN
    SELECT l.*, p.track_stock, p.name AS product_name
    FROM public.client_tab_lines l
    JOIN public.products p ON p.id = l.product_id
    WHERE l.tab_id = p_tab_id AND l.line_type = 'product'
  LOOP
    IF v_line.track_stock AND v_line.quantity > (
      SELECT stock_quantity FROM public.products WHERE id = v_line.product_id
    ) THEN
      RETURN json_build_object(
        'ok', false,
        'error', 'estoque_insuficiente',
        'product_name', v_line.product_name
      );
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT l.* FROM public.client_tab_lines l
    WHERE l.tab_id = p_tab_id AND l.line_type = 'product'
  LOOP
    v_res := public.apply_stock_movement(
      p_company_id,
      v_line.product_id,
      'sale',
      -v_line.quantity,
      'tab_line',
      v_line.id,
      'Venda na comanda'
    );
    IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
      RETURN v_res;
    END IF;
  END LOOP;

  SELECT a.service_id INTO v_svc_id
  FROM public.client_tabs t
  JOIN public.appointments a ON a.id = t.appointment_id
  WHERE t.id = p_tab_id;

  FOR v_cons IN
    SELECT sc.product_id, sc.quantity_per_service, p.name AS product_name
    FROM public.service_consumables sc
    JOIN public.products p ON p.id = sc.product_id
    WHERE sc.service_id = v_svc_id AND sc.company_id = p_company_id
  LOOP
    v_res := public.apply_stock_movement(
      p_company_id,
      v_cons.product_id,
      'consumption',
      -v_cons.quantity_per_service,
      'tab',
      p_tab_id,
      'Consumo automÃ¡tico do serviÃ§o'
    );
    IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
      RETURN json_build_object(
        'ok', false,
        'error', 'estoque_insumo_insuficiente',
        'product_name', v_cons.product_name
      );
    END IF;
  END LOOP;

  RETURN json_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Products RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_products(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'products', COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'sku', p.sku,
          'sale_price', p.sale_price,
          'cost_price', p.cost_price,
          'stock_quantity', p.stock_quantity,
          'min_stock_quantity', p.min_stock_quantity,
          'commission_pct', p.commission_pct,
          'is_consumable', p.is_consumable,
          'track_stock', p.track_stock,
          'active', p.active,
          'low_stock', (p.track_stock AND p.stock_quantity <= p.min_stock_quantity)
        )
        ORDER BY p.name
      )
      FROM public.products p
      WHERE p.company_id = p_company_id AND p.active = true
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_product(
  p_company_id uuid,
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_sale_price numeric,
  p_cost_price numeric,
  p_min_stock_quantity numeric,
  p_commission_pct numeric,
  p_is_consumable boolean,
  p_track_stock boolean,
  p_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.company_has_inventory(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'feature_indisponivel');
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'nome_obrigatorio');
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      company_id, name, sku, sale_price, cost_price, min_stock_quantity,
      commission_pct, is_consumable, track_stock, active
    )
    VALUES (
      p_company_id, trim(p_name), NULLIF(trim(p_sku), ''), COALESCE(p_sale_price, 0),
      COALESCE(p_cost_price, 0), COALESCE(p_min_stock_quantity, 0), p_commission_pct,
      COALESCE(p_is_consumable, false), COALESCE(p_track_stock, true), COALESCE(p_active, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.products SET
      name = trim(p_name),
      sku = NULLIF(trim(p_sku), ''),
      sale_price = COALESCE(p_sale_price, 0),
      cost_price = COALESCE(p_cost_price, 0),
      min_stock_quantity = COALESCE(p_min_stock_quantity, 0),
      commission_pct = p_commission_pct,
      is_consumable = COALESCE(p_is_consumable, false),
      track_stock = COALESCE(p_track_stock, true),
      active = COALESCE(p_active, true),
      updated_at = now()
    WHERE id = p_product_id AND company_id = p_company_id
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'produto_nao_encontrado');
  END IF;

  RETURN json_build_object('ok', true, 'product_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_product_stock(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity_delta numeric,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_type text;
BEGIN
  IF NOT public.company_has_inventory(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'feature_indisponivel');
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_type := CASE WHEN p_quantity_delta >= 0 THEN 'in' ELSE 'out' END;
  RETURN public.apply_stock_movement(
    p_company_id, p_product_id, v_type, p_quantity_delta, 'manual', NULL, p_notes
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Tab product lines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_client_tab_product_line(
  p_company_id uuid,
  p_tab_id uuid,
  p_product_id uuid,
  p_quantity numeric DEFAULT 1,
  p_seller_provider_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tab public.client_tabs%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_qty numeric;
  v_line_id uuid;
  v_seller_type text;
BEGIN
  IF NOT public.company_has_inventory(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'feature_indisponivel');
  END IF;
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_qty := GREATEST(COALESCE(p_quantity, 1), 0.001);

  SELECT * INTO v_tab FROM public.client_tabs t
  WHERE t.id = p_tab_id AND t.company_id = p_company_id FOR UPDATE;

  IF NOT FOUND OR v_tab.status <> 'open' THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_aberta');
  END IF;

  SELECT * INTO v_product FROM public.products p
  WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'produto_nao_encontrado');
  END IF;

  v_seller_type := CASE
    WHEN COALESCE(p_seller_provider_id, v_tab.provider_id) IS NOT NULL THEN 'provider'
    ELSE 'admin'
  END;

  INSERT INTO public.client_tab_lines (
    tab_id, company_id, line_type, product_id, description,
    quantity, unit_price, line_total, seller_type, seller_provider_id, sort_order
  )
  VALUES (
    v_tab.id, p_company_id, 'product', v_product.id, v_product.name,
    v_qty, v_product.sale_price, round(v_qty * v_product.sale_price, 2),
    v_seller_type, COALESCE(p_seller_provider_id, v_tab.provider_id),
    COALESCE((SELECT max(sort_order) + 1 FROM public.client_tab_lines WHERE tab_id = v_tab.id), 1)
  )
  RETURNING id INTO v_line_id;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);

  RETURN json_build_object('ok', true, 'line_id', v_line_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_client_tab_line(
  p_company_id uuid,
  p_line_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_line public.client_tab_lines%ROWTYPE;
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT l.* INTO v_line
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  WHERE l.id = p_line_id AND t.company_id = p_company_id AND t.status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'linha_nao_encontrada');
  END IF;

  IF v_line.line_type = 'service' THEN
    RETURN json_build_object('ok', false, 'error', 'nao_pode_remover_servico');
  END IF;

  DELETE FROM public.client_tab_lines WHERE id = v_line.id;
  PERFORM public.recalculate_client_tab_totals(v_line.tab_id);

  RETURN json_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Service consumables RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_service_consumables(
  p_company_id uuid,
  p_service_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'items', COALESCE((
      SELECT json_agg(json_build_object(
        'id', sc.id,
        'product_id', sc.product_id,
        'product_name', p.name,
        'quantity_per_service', sc.quantity_per_service,
        'stock_quantity', p.stock_quantity
      ) ORDER BY p.name)
      FROM public.service_consumables sc
      JOIN public.products p ON p.id = sc.product_id
      WHERE sc.company_id = p_company_id AND sc.service_id = p_service_id
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_service_consumable(
  p_company_id uuid,
  p_service_id uuid,
  p_product_id uuid,
  p_quantity_per_service numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.company_has_inventory(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'feature_indisponivel');
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.service_consumables (company_id, service_id, product_id, quantity_per_service)
  VALUES (p_company_id, p_service_id, p_product_id, GREATEST(p_quantity_per_service, 0.001))
  ON CONFLICT (service_id, product_id) DO UPDATE SET
    quantity_per_service = EXCLUDED.quantity_per_service
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_service_consumable(
  p_company_id uuid,
  p_consumable_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM public.service_consumables sc
  WHERE sc.id = p_consumable_id AND sc.company_id = p_company_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cash register (Fase 4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cash_register_status(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_session public.cash_register_sessions%ROWTYPE;
  v_expected json;
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_session
  FROM public.cash_register_sessions s
  WHERE s.company_id = p_company_id AND s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', true, 'session', NULL);
  END IF;

  SELECT COALESCE(json_object_agg(
    COALESCE(t.payment_method, 'outro'),
    COALESCE(sum(t.total), 0)
  ), '{}'::json)
  INTO v_expected
  FROM public.client_tabs t
  WHERE t.company_id = p_company_id
    AND t.status = 'closed'
    AND t.cash_session_id = v_session.id;

  RETURN json_build_object(
    'ok', true,
    'session', json_build_object(
      'id', v_session.id,
      'opened_at', v_session.opened_at,
      'status', v_session.status,
      'expected_by_method', v_expected,
      'closed_tabs', (
        SELECT count(*)::int FROM public.client_tabs t
        WHERE t.cash_session_id = v_session.id AND t.status = 'closed'
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_register_session(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_register_sessions s
    WHERE s.company_id = p_company_id AND s.status = 'open'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'caixa_ja_aberto');
  END IF;

  INSERT INTO public.cash_register_sessions (company_id, opened_by, status)
  VALUES (p_company_id, auth.uid(), 'open')
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'session_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_register_session(
  p_company_id uuid,
  p_session_id uuid,
  p_counts jsonb,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session public.cash_register_sessions%ROWTYPE;
  v_item jsonb;
  v_method text;
  v_counted numeric;
  v_expected numeric;
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_session
  FROM public.cash_register_sessions s
  WHERE s.id = p_session_id AND s.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'open' THEN
    RETURN json_build_object('ok', false, 'error', 'sessao_invalida');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb))
  LOOP
    v_method := v_item->>'payment_method';
    v_counted := COALESCE((v_item->>'counted_amount')::numeric, 0);
    SELECT COALESCE(sum(t.total), 0) INTO v_expected
    FROM public.client_tabs t
    WHERE t.cash_session_id = v_session.id
      AND t.status = 'closed'
      AND COALESCE(t.payment_method, 'outro') = v_method;

    INSERT INTO public.cash_register_counts (session_id, payment_method, expected_amount, counted_amount)
    VALUES (v_session.id, v_method, v_expected, v_counted)
    ON CONFLICT (session_id, payment_method) DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      counted_amount = EXCLUDED.counted_amount;
  END LOOP;

  UPDATE public.cash_register_sessions SET
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    notes = p_notes,
    updated_at = now()
  WHERE id = v_session.id;

  RETURN json_build_object('ok', true, 'session_id', v_session.id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Provider payouts (Fase 4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_commission_balance(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_start date := COALESCE(p_start_date, date_trunc('month', current_date)::date);
  v_end date := COALESCE(p_end_date, current_date);
  v_service numeric := 0;
  v_product numeric := 0;
  v_paid numeric := 0;
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR p_provider_id = public.current_user_provider_id_for_company(p_company_id)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(sum(public.appointment_provider_commission(a.id)), 0)
  INTO v_service
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.provider_id = p_provider_id
    AND a.status = 'completed'
    AND a.appointment_date BETWEEN v_start AND v_end;

  SELECT COALESCE(sum(
    public.product_line_commission(l.line_total, p.commission_pct, l.seller_provider_id)
  ), 0)
  INTO v_product
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  LEFT JOIN public.products p ON p.id = l.product_id
  JOIN public.appointments a ON a.id = t.appointment_id
  WHERE t.company_id = p_company_id
    AND l.line_type = 'product'
    AND l.seller_provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.appointment_date BETWEEN v_start AND v_end;

  SELECT COALESCE(sum(pp.amount), 0) INTO v_paid
  FROM public.provider_payouts pp
  WHERE pp.company_id = p_company_id
    AND pp.provider_id = p_provider_id
    AND pp.status = 'paid'
    AND pp.period_start >= v_start
    AND pp.period_end <= v_end;

  RETURN json_build_object(
    'ok', true,
    'service_commission', round(v_service, 2),
    'product_commission', round(v_product, 2),
    'total_commission', round(v_service + v_product, 2),
    'paid', round(v_paid, 2),
    'balance', round(v_service + v_product - v_paid, 2),
    'start_date', v_start,
    'end_date', v_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date,
  p_end_date date,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bal json;
  v_id uuid;
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_bal := public.provider_commission_balance(p_company_id, p_provider_id, p_start_date, p_end_date);
  IF NOT COALESCE((v_bal->>'ok')::boolean, false) THEN
    RETURN v_bal;
  END IF;

  IF COALESCE((v_bal->>'balance')::numeric, 0) <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'saldo_zero');
  END IF;

  INSERT INTO public.provider_payouts (
    company_id, provider_id, amount,
    service_commission, product_commission,
    period_start, period_end, notes
  )
  VALUES (
    p_company_id, p_provider_id, (v_bal->>'balance')::numeric,
    (v_bal->>'service_commission')::numeric, (v_bal->>'product_commission')::numeric,
    p_start_date, p_end_date, p_notes
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'payout_id', v_id, 'amount', (v_bal->>'balance')::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_provider_payouts(p_company_id uuid, p_provider_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT json_build_object(
    'ok', true,
    'payouts', COALESCE((
      SELECT json_agg(json_build_object(
        'id', pp.id,
        'provider_id', pp.provider_id,
        'provider_name', sp.display_name,
        'amount', pp.amount,
        'service_commission', pp.service_commission,
        'product_commission', pp.product_commission,
        'period_start', pp.period_start,
        'period_end', pp.period_end,
        'status', pp.status,
        'payment_method', pp.payment_method,
        'paid_at', pp.paid_at,
        'notes', pp.notes
      ) ORDER BY pp.created_at DESC)
      FROM public.provider_payouts pp
      JOIN public.service_providers sp ON sp.id = pp.provider_id
      WHERE pp.company_id = p_company_id
        AND (p_provider_id IS NULL OR pp.provider_id = p_provider_id)
        AND (
          public.is_platform_admin()
          OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
          OR pp.provider_id = public.current_user_provider_id_for_company(p_company_id)
        )
    ), '[]'::json)
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_provider_payout_paid(
  p_company_id uuid,
  p_payout_id uuid,
  p_payment_method text DEFAULT 'pix'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.provider_payouts SET
    status = 'paid',
    payment_method = p_payment_method,
    paid_at = now(),
    paid_by = auth.uid(),
    updated_at = now()
  WHERE id = p_payout_id
    AND company_id = p_company_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'repasse_nao_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

COMMIT;


-- Comandas Fases 3â€“5 (parte 2): close_client_tab + get_tab + comissÃ£o produtos + grants.

-- get_client_tab_for_appointment â€” incluir product_id nas linhas
CREATE OR REPLACE FUNCTION public.get_client_tab_for_appointment(p_appointment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
VOLATILE
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tab public.client_tabs%ROWTYPE;
  v_lines json;
  v_pkg public.client_packages%ROWTYPE;
  v_remaining int;
  v_pending_payment boolean := false;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO v_appt FROM public.appointments a WHERE a.id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR v_appt.company_id IN (SELECT public.current_user_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  PERFORM public.create_client_tab_for_appointment(v_appt.id);

  SELECT * INTO v_tab FROM public.client_tabs t WHERE t.appointment_id = p_appointment_id;

  IF v_tab.status = 'open' AND v_appt.client_package_id IS NOT NULL THEN
    PERFORM public.sync_client_tab_package_pricing(v_tab.id);
    SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'id', x.id,
      'line_type', x.line_type,
      'service_id', x.service_id,
      'product_id', x.product_id,
      'description', x.description,
      'quantity', x.quantity,
      'unit_price', x.unit_price,
      'line_total', x.line_total,
      'seller_type', x.seller_type,
      'seller_provider_id', x.seller_provider_id
    )
    ORDER BY x.sort_order, x.created_at
  ), '[]'::json)
  INTO v_lines
  FROM (
    SELECT
      l.id, l.line_type, l.service_id, l.product_id, l.description,
      l.quantity, l.unit_price, l.line_total, l.seller_type, l.seller_provider_id,
      l.sort_order, l.created_at
    FROM public.client_tab_lines l
    WHERE l.tab_id = v_tab.id
  ) x;

  v_remaining := NULL;
  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND THEN
      v_remaining := GREATEST(v_pkg.total_sessions - v_pkg.used_sessions, 0);
      v_pending_payment := (v_pkg.status = 'pending_payment');
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'tab', json_build_object(
      'id', v_tab.id,
      'company_id', v_tab.company_id,
      'appointment_id', v_tab.appointment_id,
      'client_id', v_tab.client_id,
      'provider_id', v_tab.provider_id,
      'status', v_tab.status,
      'subtotal', v_tab.subtotal,
      'total', v_tab.total,
      'payment_method', v_tab.payment_method,
      'closed_at', v_tab.closed_at,
      'product_sales_total', COALESCE(v_tab.product_sales_total, 0),
      'product_commission_total', COALESCE(v_tab.product_commission_total, 0)
    ),
    'lines', v_lines,
    'appointment', json_build_object(
      'id', v_appt.id,
      'status', v_appt.status,
      'appointment_date', v_appt.appointment_date,
      'appointment_time', to_char(v_appt.appointment_time, 'HH24:MI'),
      'client_package_id', v_appt.client_package_id,
      'package_session_number', v_appt.package_session_number
    ),
    'client', (
      SELECT json_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp)
      FROM public.clients c WHERE c.id = v_appt.client_id
    ),
    'package_remaining', v_remaining,
    'package_pending_payment', v_pending_payment,
    'inventory_enabled', public.company_has_inventory(v_tab.company_id)
  );
END;
$$;

-- close_client_tab â€” estoque, consumÃ­veis, caixa, comissÃ£o produtos
CREATE OR REPLACE FUNCTION public.close_client_tab(
  p_company_id uuid,
  p_tab_id uuid,
  p_payment_method text,
  p_package_resolution text DEFAULT NULL,
  p_single_service_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tab public.client_tabs%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_pkg public.client_packages%ROWTYPE;
  v_svc public.services%ROWTYPE;
  v_single_svc public.services%ROWTYPE;
  v_consume json;
  v_inv json;
  v_product_totals json;
  v_remaining int;
  v_reconciled boolean := false;
  v_commission_base numeric(12, 2) := 0;
  v_service_total numeric(12, 2) := 0;
  v_session_num int;
  v_resolution text;
  v_lines_updated int;
  v_cash_session_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_tab_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN (
    'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forma_pagamento_invalida');
  END IF;

  v_resolution := NULLIF(trim(lower(COALESCE(p_package_resolution, ''))), '');

  IF v_resolution IS NOT NULL AND v_resolution NOT IN ('confirm', 'avulso') THEN
    RETURN json_build_object('ok', false, 'error', 'resolucao_pacote_invalida');
  END IF;

  SELECT * INTO v_tab
  FROM public.client_tabs t
  WHERE t.id = p_tab_id AND t.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_encontrada');
  END IF;

  IF v_tab.status = 'closed' THEN
    RETURN json_build_object('ok', true, 'tab_id', v_tab.id, 'already_closed', true);
  END IF;

  IF v_tab.status <> 'open' THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_aberta');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments a
  WHERE a.id = v_tab.appointment_id
  FOR UPDATE;

  IF v_appt.status IN ('cancelled', 'no_show') THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_cancelado');
  END IF;

  SELECT * INTO v_svc FROM public.services s WHERE s.id = v_appt.service_id;

  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id FOR UPDATE;

    IF FOUND AND v_pkg.status = 'pending_payment' THEN
      IF v_resolution IS NULL THEN
        RETURN json_build_object(
          'ok', false,
          'error', 'aguardando_pagamento_salao',
          'message', 'Escolha confirmar o pacote ou marcar como avulso antes de fechar.'
        );
      END IF;

      IF NOT public.user_can_confirm_client_package(p_company_id, v_pkg.provider_id) THEN
        RETURN json_build_object('ok', false, 'error', 'forbidden');
      END IF;

      IF v_resolution = 'confirm' THEN
        UPDATE public.client_packages SET
          status = 'active',
          paid_at = now(),
          payment_confirmed_at = now(),
          payment_confirmed_by = auth.uid(),
          updated_at = now()
        WHERE id = v_pkg.id;
        SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_pkg.id;
      ELSIF v_resolution = 'avulso' THEN
        IF p_single_service_id IS NULL THEN
          RETURN json_build_object(
            'ok', false,
            'error', 'servico_avulso_obrigatorio',
            'message', 'Selecione o serviÃ§o avulso que a cliente recebeu.'
          );
        END IF;

        SELECT * INTO v_single_svc
        FROM public.services s
        WHERE s.id = p_single_service_id
          AND s.company_id = p_company_id
          AND s.active = true;

        IF NOT FOUND THEN
          RETURN json_build_object('ok', false, 'error', 'servico_nao_encontrado');
        END IF;

        IF COALESCE(v_single_svc.service_kind, 'single') = 'package' THEN
          RETURN json_build_object('ok', false, 'error', 'servico_avulso_invalido');
        END IF;

        UPDATE public.client_packages SET status = 'cancelled', updated_at = now() WHERE id = v_pkg.id;

        UPDATE public.appointments SET
          client_package_id = NULL,
          package_session_number = NULL,
          service_id = v_single_svc.id,
          updated_at = now()
        WHERE id = v_appt.id;

        UPDATE public.client_tab_lines l SET
          service_id = v_single_svc.id,
          description = v_single_svc.name,
          unit_price = COALESCE(v_single_svc.price, 0),
          line_total = COALESCE(v_single_svc.price, 0)
        WHERE l.tab_id = v_tab.id AND l.line_type = 'service';

        GET DIAGNOSTICS v_lines_updated = ROW_COUNT;

        IF v_lines_updated = 0 THEN
          INSERT INTO public.client_tab_lines (
            tab_id, company_id, line_type, service_id, description,
            quantity, unit_price, line_total, seller_type, seller_provider_id, sort_order
          )
          VALUES (
            v_tab.id, v_tab.company_id, 'service', v_single_svc.id, v_single_svc.name,
            1, COALESCE(v_single_svc.price, 0), COALESCE(v_single_svc.price, 0),
            CASE WHEN v_tab.provider_id IS NOT NULL THEN 'provider' ELSE 'admin' END,
            v_tab.provider_id, 0
          );
        END IF;

        PERFORM public.recalculate_client_tab_totals(v_tab.id);
        SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;
        SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
        v_svc := v_single_svc;
      END IF;
    END IF;
  END IF;

  IF v_appt.status = 'completed' THEN
    v_reconciled := true;
  END IF;

  IF v_appt.client_package_id IS NOT NULL AND v_appt.package_session_number IS NULL THEN
    v_consume := public.consume_client_package_session(v_appt.id);
    IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN json_build_object('ok', false, 'error', COALESCE(v_consume->>'error', 'pacote_invalido'));
    END IF;
  END IF;

  IF v_appt.status <> 'completed' THEN
    UPDATE public.appointments SET status = 'completed', updated_at = now() WHERE id = v_appt.id;
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_appt.id;
  SELECT * INTO v_svc FROM public.services WHERE id = v_appt.service_id;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);
  SELECT * INTO v_tab FROM public.client_tabs WHERE id = v_tab.id;

  v_inv := public.finalize_tab_inventory(v_tab.id, p_company_id);
  IF NOT COALESCE((v_inv->>'ok')::boolean, false) THEN
    RETURN v_inv;
  END IF;

  v_product_totals := public.compute_tab_product_totals(v_tab.id);

  SELECT COALESCE(sum(l.line_total), 0) INTO v_service_total
  FROM public.client_tab_lines l
  WHERE l.tab_id = v_tab.id AND l.line_type IN ('service', 'service_extra');

  v_session_num := v_appt.package_session_number;

  IF v_appt.client_package_id IS NOT NULL THEN
    IF v_session_num = 1 THEN
      v_commission_base := COALESCE(v_svc.price, 0);
    ELSE
      v_commission_base := 0;
    END IF;
  ELSE
    v_commission_base := CASE
      WHEN v_service_total > 0 THEN v_service_total
      ELSE COALESCE(v_svc.price, 0)
    END;
  END IF;

  SELECT s.id INTO v_cash_session_id
  FROM public.cash_register_sessions s
  WHERE s.company_id = p_company_id AND s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  UPDATE public.client_tabs SET
    status = 'closed',
    payment_method = p_payment_method,
    commission_base = v_commission_base,
    product_sales_total = COALESCE((v_product_totals->>'product_sales')::numeric, 0),
    product_commission_total = COALESCE((v_product_totals->>'product_commission')::numeric, 0),
    cash_session_id = v_cash_session_id,
    closed_at = now(),
    closed_by = auth.uid(),
    updated_at = now()
  WHERE id = v_tab.id;

  v_remaining := NULL;
  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND THEN
      v_remaining := GREATEST(v_pkg.total_sessions - v_pkg.used_sessions, 0);
    END IF;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'tab_id', v_tab.id,
    'appointment_id', v_appt.id,
    'total', (SELECT total FROM public.client_tabs WHERE id = v_tab.id),
    'commission_base', v_commission_base,
    'product_sales', COALESCE((v_product_totals->>'product_sales')::numeric, 0),
    'product_commission', COALESCE((v_product_totals->>'product_commission')::numeric, 0),
    'package_remaining', v_remaining,
    'package_session_number', v_session_num,
    'reconciled', v_reconciled,
    'message', CASE
      WHEN v_remaining IS NOT NULL AND v_session_num = 1 THEN
        'Pacote confirmado e 1Âª sessÃ£o concluÃ­da. Restam ' || v_remaining::text || ' sessÃ£o(Ãµes).'
      WHEN v_remaining IS NOT NULL THEN
        'Atendimento concluÃ­do. Restam ' || v_remaining::text || ' sessÃ£o(Ãµes) do pacote.'
      WHEN v_resolution = 'avulso' THEN
        'Atendimento avulso concluÃ­do â€” pacote cancelado.'
      WHEN v_reconciled THEN
        'Comanda sincronizada â€” atendimento jÃ¡ estava concluÃ­do.'
      ELSE
        'Atendimento concluÃ­do.'
    END
  );
END;
$$;

-- ComissÃ£o produtos no dashboard prestador (realizado)
CREATE OR REPLACE FUNCTION public.provider_product_commission_for_period(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date,
  p_end_date date,
  p_only_past boolean DEFAULT false
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(
    public.product_line_commission(l.line_total, p.commission_pct, l.seller_provider_id)
  ), 0)
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  LEFT JOIN public.products p ON p.id = l.product_id
  JOIN public.appointments a ON a.id = t.appointment_id
  WHERE t.company_id = p_company_id
    AND l.line_type = 'product'
    AND l.seller_provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.appointment_date BETWEEN p_start_date AND p_end_date
    AND (NOT p_only_past OR a.appointment_date < current_date);
$$;

-- Grants
REVOKE ALL ON FUNCTION public.company_has_inventory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_line_commission(numeric, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stock_movement(uuid, uuid, text, numeric, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_tab_product_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_tab_inventory(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_products(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_product(uuid, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_adjust_product_stock(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_client_tab_product_line(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_client_tab_line(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_service_consumables(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_service_consumable(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_service_consumable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cash_register_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_cash_register_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_register_session(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_commission_balance(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_provider_payout(uuid, uuid, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_provider_payouts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_provider_payout_paid(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_product_commission_for_period(uuid, uuid, date, date, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.company_has_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_products(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_product(uuid, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_product_stock(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_client_tab_product_line(uuid, uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_client_tab_line(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_service_consumables(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_service_consumable(uuid, uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_service_consumable(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_register_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_register_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_register_session(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_commission_balance(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_provider_payout(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_payouts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_payout_paid(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';



-- === fix repasses (20260613000002) ===
-- Corrige repasses: saldo sem dependÃªncia de migration 120, anti-duplicidade e overlap de perÃ­odo.

CREATE OR REPLACE FUNCTION public.provider_commission_balance(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_start date := COALESCE(p_start_date, date_trunc('month', current_date)::date);
  v_end date := COALESCE(p_end_date, current_date);
  v_service numeric := 0;
  v_product numeric := 0;
  v_paid numeric := 0;
  v_pending numeric := 0;
  v_reserved numeric := 0;
BEGIN
  IF p_company_id IS NULL OR p_provider_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF v_start > v_end THEN
    RETURN json_build_object('ok', false, 'error', 'periodo_invalido');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR p_provider_id = public.current_user_provider_id_for_company(p_company_id)
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- ComissÃ£o de serviÃ§os: base gravada na comanda fechada Ã— % do prestador
  SELECT COALESCE(sum(
    round(t.commission_base * COALESCE(sp.default_commission_pct, 0) / 100.0, 2)
  ), 0)
  INTO v_service
  FROM public.client_tabs t
  JOIN public.appointments a ON a.id = t.appointment_id
  JOIN public.service_providers sp ON sp.id = t.provider_id
  WHERE t.company_id = p_company_id
    AND t.provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.status = 'completed'
    AND a.appointment_date BETWEEN v_start AND v_end;

  -- ComissÃ£o de produtos vendidos pelo prestador na comanda
  SELECT COALESCE(sum(
    public.product_line_commission(l.line_total, p.commission_pct, l.seller_provider_id)
  ), 0)
  INTO v_product
  FROM public.client_tab_lines l
  JOIN public.client_tabs t ON t.id = l.tab_id
  LEFT JOIN public.products p ON p.id = l.product_id
  JOIN public.appointments a ON a.id = t.appointment_id
  WHERE t.company_id = p_company_id
    AND l.line_type = 'product'
    AND l.seller_provider_id = p_provider_id
    AND t.status = 'closed'
    AND a.appointment_date BETWEEN v_start AND v_end;

  -- Repasses jÃ¡ pagos (perÃ­odo sobreposto ao filtro)
  SELECT COALESCE(sum(pp.amount), 0)
  INTO v_paid
  FROM public.provider_payouts pp
  WHERE pp.company_id = p_company_id
    AND pp.provider_id = p_provider_id
    AND pp.status = 'paid'
    AND pp.period_start <= v_end
    AND pp.period_end >= v_start;

  -- Repasses pendentes (reservam saldo â€” evita gerar 2Ã—)
  SELECT COALESCE(sum(pp.amount), 0)
  INTO v_pending
  FROM public.provider_payouts pp
  WHERE pp.company_id = p_company_id
    AND pp.provider_id = p_provider_id
    AND pp.status = 'pending'
    AND pp.period_start <= v_end
    AND pp.period_end >= v_start;

  v_reserved := v_paid + v_pending;

  RETURN json_build_object(
    'ok', true,
    'service_commission', round(v_service, 2),
    'product_commission', round(v_product, 2),
    'total_commission', round(v_service + v_product, 2),
    'paid', round(v_paid, 2),
    'pending', round(v_pending, 2),
    'balance', round(v_service + v_product - v_reserved, 2),
    'start_date', v_start,
    'end_date', v_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_provider_payout(
  p_company_id uuid,
  p_provider_id uuid,
  p_start_date date,
  p_end_date date,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bal json;
  v_id uuid;
  v_pending_exists boolean;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN json_build_object('ok', false, 'error', 'periodo_invalido');
  END IF;

  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.provider_payouts pp
    WHERE pp.company_id = p_company_id
      AND pp.provider_id = p_provider_id
      AND pp.status = 'pending'
  )
  INTO v_pending_exists;

  IF v_pending_exists THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'repasse_pendente_existente',
      'message', 'JÃ¡ existe um repasse pendente para este prestador. Marque como pago ou cancele antes de gerar outro.'
    );
  END IF;

  v_bal := public.provider_commission_balance(p_company_id, p_provider_id, p_start_date, p_end_date);
  IF NOT COALESCE((v_bal->>'ok')::boolean, false) THEN
    RETURN v_bal;
  END IF;

  IF COALESCE((v_bal->>'balance')::numeric, 0) <= 0 THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'saldo_zero',
      'message', 'NÃ£o hÃ¡ saldo de comissÃ£o disponÃ­vel neste perÃ­odo.'
    );
  END IF;

  INSERT INTO public.provider_payouts (
    company_id, provider_id, amount,
    service_commission, product_commission,
    period_start, period_end, notes
  )
  VALUES (
    p_company_id,
    p_provider_id,
    (v_bal->>'balance')::numeric,
    (v_bal->>'service_commission')::numeric,
    (v_bal->>'product_commission')::numeric,
    p_start_date,
    p_end_date,
    p_notes
  )
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'ok', true,
    'payout_id', v_id,
    'amount', (v_bal->>'balance')::numeric
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_provider_payouts(
  p_company_id uuid,
  p_provider_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    OR (
      p_provider_id IS NOT NULL
      AND p_provider_id = public.current_user_provider_id_for_company(p_company_id)
    )
    OR (
      p_provider_id IS NULL
      AND p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'payouts', COALESCE((
      SELECT json_agg(json_build_object(
        'id', pp.id,
        'provider_id', pp.provider_id,
        'provider_name', sp.display_name,
        'amount', pp.amount,
        'service_commission', pp.service_commission,
        'product_commission', pp.product_commission,
        'period_start', pp.period_start,
        'period_end', pp.period_end,
        'status', pp.status,
        'payment_method', pp.payment_method,
        'paid_at', pp.paid_at,
        'notes', pp.notes
      ) ORDER BY pp.created_at DESC)
      FROM public.provider_payouts pp
      JOIN public.service_providers sp ON sp.id = pp.provider_id
      WHERE pp.company_id = p_company_id
        AND (p_provider_id IS NULL OR pp.provider_id = p_provider_id)
        AND (
          public.is_platform_admin()
          OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
          OR pp.provider_id = public.current_user_provider_id_for_company(p_company_id)
        )
    ), '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_provider_payout(
  p_company_id uuid,
  p_payout_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.user_can_close_client_tab(p_company_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.provider_payouts SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = p_payout_id
    AND company_id = p_company_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'repasse_nao_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_provider_payout(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_provider_payout(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

