-- Fase 1: Comanda core — 1 agendamento = 1 comanda; fechamento no caixa/admin conclui atendimento.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.service_providers (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  subtotal numeric(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_method text,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_tabs_payment_method_check CHECK (
    payment_method IS NULL
    OR payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')
  )
);

CREATE INDEX IF NOT EXISTS idx_client_tabs_company_date
  ON public.client_tabs (company_id, status);

CREATE INDEX IF NOT EXISTS idx_client_tabs_appointment
  ON public.client_tabs (appointment_id);

CREATE TABLE IF NOT EXISTS public.client_tab_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.client_tabs (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN ('service', 'service_extra', 'product')),
  service_id uuid REFERENCES public.services (id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  seller_type text CHECK (seller_type IS NULL OR seller_type IN ('provider', 'caixa', 'admin')),
  seller_provider_id uuid REFERENCES public.service_providers (id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_tab_lines_tab
  ON public.client_tab_lines (tab_id, sort_order);

DROP TRIGGER IF EXISTS trg_client_tabs_updated_at ON public.client_tabs;
CREATE TRIGGER trg_client_tabs_updated_at
  BEFORE UPDATE ON public.client_tabs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.client_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tab_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_tabs_tenant ON public.client_tabs;
CREATE POLICY client_tabs_tenant ON public.client_tabs
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.user_can_access_company_appointment(company_id, provider_id)
  );

DROP POLICY IF EXISTS client_tab_lines_tenant ON public.client_tab_lines;
CREATE POLICY client_tab_lines_tenant ON public.client_tab_lines
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_close_client_tab(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids());
$$;

CREATE OR REPLACE FUNCTION public.recalculate_client_tab_totals(p_tab_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric(12, 2);
BEGIN
  SELECT COALESCE(sum(l.line_total), 0) INTO v_sum
  FROM public.client_tab_lines l
  WHERE l.tab_id = p_tab_id;

  UPDATE public.client_tabs SET
    subtotal = v_sum,
    total = v_sum,
    updated_at = now()
  WHERE id = p_tab_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_client_tab_for_appointment(p_appointment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_svc public.services%ROWTYPE;
  v_tab_id uuid;
  v_unit_price numeric(12, 2);
  v_desc text;
  v_pkg public.client_packages%ROWTYPE;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_tab_id
  FROM public.client_tabs
  WHERE appointment_id = p_appointment_id;

  IF v_tab_id IS NOT NULL THEN
    RETURN v_tab_id;
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_appt.status IN ('cancelled', 'no_show') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = v_appt.client_id;
  SELECT * INTO v_svc FROM public.services WHERE id = v_appt.service_id;

  IF v_appt.client_package_id IS NOT NULL THEN
    v_unit_price := 0;
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    v_desc := COALESCE(v_svc.name, 'Serviço') || ' (pacote · sessão)';
    IF v_pkg.id IS NOT NULL THEN
      v_desc := COALESCE(v_svc.name, 'Serviço')
        || ' (pacote · '
        || (v_pkg.used_sessions + 1)::text || '/' || v_pkg.total_sessions::text
        || ')';
    END IF;
  ELSE
    v_unit_price := COALESCE(v_svc.price, 0);
    v_desc := COALESCE(v_svc.name, 'Serviço');
  END IF;

  INSERT INTO public.client_tabs (
    company_id, appointment_id, client_id, provider_id, status
  )
  VALUES (
    v_appt.company_id, v_appt.id, v_appt.client_id, v_appt.provider_id, 'open'
  )
  RETURNING id INTO v_tab_id;

  INSERT INTO public.client_tab_lines (
    tab_id, company_id, line_type, service_id, description,
    quantity, unit_price, line_total, seller_type, seller_provider_id, sort_order
  )
  VALUES (
    v_tab_id,
    v_appt.company_id,
    'service',
    v_appt.service_id,
    v_desc,
    1,
    v_unit_price,
    v_unit_price,
    CASE WHEN v_appt.provider_id IS NOT NULL THEN 'provider' ELSE 'admin' END,
    v_appt.provider_id,
    0
  );

  PERFORM public.recalculate_client_tab_totals(v_tab_id);
  RETURN v_tab_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_appointments_create_client_tab()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_client_tab_for_appointment(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_create_client_tab ON public.appointments;
CREATE TRIGGER trg_appointments_create_client_tab
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_appointments_create_client_tab();

CREATE OR REPLACE FUNCTION public.trg_appointments_cancel_client_tab()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'no_show') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.client_tabs SET
      status = 'cancelled',
      updated_at = now()
    WHERE appointment_id = NEW.id
      AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_cancel_client_tab ON public.appointments;
CREATE TRIGGER trg_appointments_cancel_client_tab
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_appointments_cancel_client_tab();

-- Backfill comandas para agendamentos recentes/futuros
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.id
    FROM public.appointments a
    WHERE a.status IN ('scheduled', 'confirmed', 'completed')
      AND a.appointment_date >= (current_date - 30)
      AND NOT EXISTS (
        SELECT 1 FROM public.client_tabs t WHERE t.appointment_id = a.id
      )
  LOOP
    PERFORM public.create_client_tab_for_appointment(r.id);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_client_tab_for_appointment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_tab_for_appointment(p_appointment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tab public.client_tabs%ROWTYPE;
  v_lines json;
  v_pkg public.client_packages%ROWTYPE;
  v_remaining int;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF NOT public.user_can_access_company_appointment(v_appt.company_id, v_appt.provider_id) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_tab FROM public.client_tabs WHERE appointment_id = p_appointment_id;
  IF NOT FOUND THEN
    PERFORM public.create_client_tab_for_appointment(p_appointment_id);
    SELECT * INTO v_tab FROM public.client_tabs WHERE appointment_id = p_appointment_id;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_encontrada');
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.sort_order, x.created_at), '[]'::json)
  INTO v_lines
  FROM (
    SELECT
      l.id,
      l.line_type,
      l.service_id,
      l.description,
      l.quantity,
      l.unit_price,
      l.line_total,
      l.seller_type,
      l.seller_provider_id,
      l.sort_order,
      l.created_at
    FROM public.client_tab_lines l
    WHERE l.tab_id = v_tab.id
  ) x;

  v_remaining := NULL;
  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND THEN
      v_remaining := GREATEST(v_pkg.total_sessions - v_pkg.used_sessions, 0);
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
      'closed_at', v_tab.closed_at
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
      SELECT json_build_object(
        'id', c.id,
        'name', c.name,
        'whatsapp', c.whatsapp
      )
      FROM public.clients c WHERE c.id = v_appt.client_id
    ),
    'package_remaining', v_remaining,
    'package_pending_payment', (
      SELECT cp.status = 'pending_payment'
      FROM public.client_packages cp
      WHERE cp.id = v_appt.client_package_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- list_client_tabs_for_date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_client_tabs_for_date(p_company_id uuid, p_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
BEGIN
  IF p_company_id IS NULL OR p_date IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'tabs', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.appointment_time, x.client_name)
      FROM (
        SELECT
          t.id,
          t.status,
          t.subtotal,
          t.total,
          t.payment_method,
          t.closed_at,
          a.id AS appointment_id,
          a.status AS appointment_status,
          to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
          a.client_package_id,
          c.name AS client_name,
          c.whatsapp AS client_whatsapp,
          s.name AS service_name,
          sp.display_name AS provider_name
        FROM public.client_tabs t
        JOIN public.appointments a ON a.id = t.appointment_id
        JOIN public.clients c ON c.id = t.client_id
        JOIN public.services s ON s.id = a.service_id
        LEFT JOIN public.service_providers sp ON sp.id = t.provider_id
        WHERE t.company_id = p_company_id
          AND a.appointment_date = p_date
          AND (
            public.is_platform_admin()
            OR public.user_can_close_client_tab(p_company_id)
            OR (
              public.current_user_provider_id_for_company(p_company_id) IS NOT NULL
              AND t.provider_id = public.current_user_provider_id_for_company(p_company_id)
            )
          )
      ) x
    ), '[]'::json)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- close_client_tab — atômico: pagamento + sessão pacote + completed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_client_tab(
  p_company_id uuid,
  p_tab_id uuid,
  p_payment_method text
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
  v_consume json;
  v_remaining int;
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

  SELECT * INTO v_tab
  FROM public.client_tabs t
  WHERE t.id = p_tab_id AND t.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_encontrada');
  END IF;

  IF v_tab.status <> 'open' THEN
    RETURN json_build_object('ok', false, 'error', 'comanda_nao_aberta');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments a
  WHERE a.id = v_tab.appointment_id
  FOR UPDATE;

  IF v_appt.status IN ('cancelled', 'no_show', 'completed') THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_invalido');
  END IF;

  IF v_appt.client_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.client_packages WHERE id = v_appt.client_package_id;
    IF FOUND AND v_pkg.status = 'pending_payment' THEN
      RETURN json_build_object(
        'ok', false,
        'error', 'aguardando_pagamento_salao',
        'message', 'Confirme o pagamento do pacote antes de fechar a comanda.'
      );
    END IF;
  END IF;

  IF v_appt.client_package_id IS NOT NULL THEN
    v_consume := public.consume_client_package_session(v_appt.id);
    IF COALESCE((v_consume->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN json_build_object(
        'ok', false,
        'error', COALESCE(v_consume->>'error', 'pacote_invalido')
      );
    END IF;
  END IF;

  UPDATE public.appointments SET
    status = 'completed',
    updated_at = now()
  WHERE id = v_appt.id;

  PERFORM public.recalculate_client_tab_totals(v_tab.id);

  UPDATE public.client_tabs SET
    status = 'closed',
    payment_method = p_payment_method,
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
    'package_remaining', v_remaining,
    'message', CASE
      WHEN v_remaining IS NOT NULL THEN
        'Atendimento concluído. Restam ' || v_remaining::text || ' sessão(ões) do pacote.'
      ELSE
        'Atendimento concluído.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- transfer_tab_provider — admin; bloqueia pacote
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_tab_provider(
  p_company_id uuid,
  p_appointment_id uuid,
  p_new_provider_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tab public.client_tabs%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_appointment_id IS NULL OR p_new_provider_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR p_company_id IN (SELECT public.current_user_owner_admin_company_ids())
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments a
  WHERE a.id = p_appointment_id AND a.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_nao_encontrado');
  END IF;

  IF v_appt.client_package_id IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pacote_prestador_fixo');
  END IF;

  IF v_appt.status IN ('completed', 'cancelled', 'no_show') THEN
    RETURN json_build_object('ok', false, 'error', 'agendamento_invalido');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.service_providers sp
    JOIN public.provider_services ps ON ps.provider_id = sp.id
    WHERE sp.id = p_new_provider_id
      AND sp.company_id = p_company_id
      AND sp.active = true
      AND ps.service_id = v_appt.service_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'prestador_invalido');
  END IF;

  UPDATE public.appointments SET
    provider_id = p_new_provider_id,
    updated_at = now()
  WHERE id = v_appt.id;

  UPDATE public.client_tabs SET
    provider_id = p_new_provider_id,
    updated_at = now()
  WHERE appointment_id = v_appt.id
    AND status = 'open';

  SELECT * INTO v_tab FROM public.client_tabs WHERE appointment_id = v_appt.id;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'provider_id', p_new_provider_id,
    'tab_id', v_tab.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_tab_for_appointment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_client_tab_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_tab_for_appointment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_client_tabs_for_date(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_client_tab(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_tab_provider(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_close_client_tab(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_client_tab_for_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_client_tabs_for_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_client_tab(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_tab_provider(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
