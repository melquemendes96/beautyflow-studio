-- Fase 3 — Row Level Security e políticas multiempresa
-- Depende de: 20260206120000_fase2_multi_tenant_schema.sql
--
-- Papéis:
--   • platform_admin — acesso total (tabela platform_admins)
--   • owner / admin — dados da própria empresa; gestão de usuários, marca, assinatura (leitura), WhatsApp, configurações
--   • staff — agenda, clientes, serviços, lista de espera, bloqueios, avaliações; sem assinatura/pagamentos/cupons/WhatsApp credenciais
--   • público (anon) — sem SELECT direto em tabelas sensíveis; apenas RPCs get_booking_page_data / create_public_booking

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER: leem company_users sem recursão de RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT cu.company_id
  FROM public.company_users cu
  WHERE cu.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_owner_admin_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT cu.company_id
  FROM public.company_users cu
  WHERE cu.user_id = auth.uid()
    AND cu.role IN ('owner', 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Página pública de agendamento (anon) — leitura segura por slug
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_page_data(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  c public.companies%ROWTYPE;
  b public.branding_settings%ROWTYPE;
  j json;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO c
  FROM public.companies
  WHERE slug = trim(p_slug)
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO b
  FROM public.branding_settings
  WHERE company_id = c.id;

  SELECT coalesce(
    (
      SELECT json_agg(svc.obj)
      FROM (
        SELECT json_build_object(
          'id', s.id,
          'name', s.name,
          'description', s.description,
          'price', s.price,
          'duration_minutes', s.duration_minutes,
          'buffer_minutes', s.buffer_minutes,
          'image_url', s.image_url,
          'category', s.category
        ) AS obj
        FROM public.services s
        WHERE s.company_id = c.id
          AND s.active = true
        ORDER BY s.name
      ) svc
    ),
    '[]'::json
  )
  INTO j;

  RETURN json_build_object(
    'company',
    json_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'email', c.email,
      'phone', c.phone,
      'status', c.status
    ),
    'branding',
    CASE
      WHEN b.id IS NULL THEN NULL::json
      ELSE to_jsonb(b) - 'id' - 'company_id' - 'created_at' - 'updated_at'
    END,
    'services',
    j
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Agendamento público — valida slug + serviço; cria/atualiza cliente e agendamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_client_name text,
  p_client_email text,
  p_client_whatsapp text,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  svc public.services%ROWTYPE;
  v_client_id uuid;
  v_appt_id uuid;
  v_email text;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'slug_obrigatorio');
  END IF;

  IF p_service_id IS NULL OR p_appointment_date IS NULL OR p_appointment_time IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'dados_incompletos');
  END IF;

  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'nome_obrigatorio');
  END IF;

  IF (p_client_email IS NULL OR length(trim(p_client_email)) = 0)
     AND (p_client_whatsapp IS NULL OR length(trim(p_client_whatsapp)) = 0) THEN
    RETURN json_build_object('ok', false, 'error', 'email_ou_whatsapp_obrigatorio');
  END IF;

  SELECT *
  INTO comp
  FROM public.companies
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND OR comp.status <> 'active' THEN
    RETURN json_build_object('ok', false, 'error', 'empresa_nao_encontrada');
  END IF;

  SELECT *
  INTO svc
  FROM public.services
  WHERE id = p_service_id;

  IF NOT FOUND OR svc.company_id <> comp.id OR NOT svc.active THEN
    RETURN json_build_object('ok', false, 'error', 'servico_invalido');
  END IF;

  v_email := nullif(lower(trim(p_client_email)), '');

  IF v_email IS NOT NULL THEN
    SELECT id
    INTO v_client_id
    FROM public.clients
    WHERE company_id = comp.id
      AND lower(trim(coalesce(email, ''))) = v_email
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND p_client_whatsapp IS NOT NULL AND length(trim(p_client_whatsapp)) > 0 THEN
    SELECT id
    INTO v_client_id
    FROM public.clients
    WHERE company_id = comp.id
      AND whatsapp = trim(p_client_whatsapp)
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (company_id, name, email, whatsapp, notes)
    VALUES (
      comp.id,
      trim(p_client_name),
      nullif(trim(p_client_email), ''),
      nullif(trim(p_client_whatsapp), ''),
      p_notes
    )
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients
    SET
      name = trim(p_client_name),
      email = coalesce(nullif(trim(p_client_email), ''), email),
      whatsapp = coalesce(nullif(trim(p_client_whatsapp), ''), whatsapp),
      notes = coalesce(p_notes, notes),
      updated_at = now()
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.appointments (
    company_id,
    client_id,
    service_id,
    appointment_date,
    appointment_time,
    status
  )
  VALUES (
    comp.id,
    v_client_id,
    p_service_id,
    p_appointment_date,
    p_appointment_time,
    'scheduled'
  )
  RETURNING id INTO v_appt_id;

  RETURN json_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'client_id', v_client_id,
    'company_id', comp.id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'conflito_agenda');
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', 'erro_interno');
END;
$$;

-- ---------------------------------------------------------------------------
-- Habilitar RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- platform_admins
-- ---------------------------------------------------------------------------
CREATE POLICY platform_admins_select
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY platform_admins_insert
  ON public.platform_admins FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY platform_admins_update
  ON public.platform_admins FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY platform_admins_delete
  ON public.platform_admins FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
CREATE POLICY plans_select_public
  ON public.plans FOR SELECT
  USING (active = true OR public.is_platform_admin());

CREATE POLICY plans_insert
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY plans_update
  ON public.plans FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY plans_delete
  ON public.plans FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE POLICY companies_select_member
  ON public.companies FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY companies_insert
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY companies_update
  ON public.companies FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY companies_delete
  ON public.companies FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- company_users
-- ---------------------------------------------------------------------------
CREATE POLICY company_users_select
  ON public.company_users FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY company_users_insert
  ON public.company_users FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY company_users_update
  ON public.company_users FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY company_users_delete
  ON public.company_users FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

-- ---------------------------------------------------------------------------
-- clients, services, appointments, schedule_blocks, waitlist, appointment_ratings
-- (qualquer membro da empresa: owner, admin, staff)
-- ---------------------------------------------------------------------------
CREATE POLICY clients_all
  ON public.clients FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY services_all
  ON public.services FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY appointments_all
  ON public.appointments FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY schedule_blocks_all
  ON public.schedule_blocks FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY waitlist_all
  ON public.waitlist FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY appointment_ratings_all
  ON public.appointment_ratings FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

-- ---------------------------------------------------------------------------
-- branding_settings, business_settings — staff pode ler; só owner/admin altera
-- ---------------------------------------------------------------------------
CREATE POLICY branding_select
  ON public.branding_settings FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY business_settings_select
  ON public.business_settings FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_company_ids())
  );

CREATE POLICY branding_insert
  ON public.branding_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY branding_update
  ON public.branding_settings FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY branding_delete
  ON public.branding_settings FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY business_settings_insert
  ON public.business_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY business_settings_update
  ON public.business_settings FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY business_settings_delete
  ON public.business_settings FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

-- ---------------------------------------------------------------------------
-- subscriptions, payments — staff não enxerga; só owner/admin + master
-- ---------------------------------------------------------------------------
CREATE POLICY subscriptions_select
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY subscriptions_write
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY subscriptions_update
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY subscriptions_delete
  ON public.subscriptions FOR DELETE TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY payments_select
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY payments_insert
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY payments_update
  ON public.payments FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY payments_delete
  ON public.payments FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------
CREATE POLICY support_tickets_select
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  );

CREATE POLICY support_tickets_insert
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  );

CREATE POLICY support_tickets_update
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  );

CREATE POLICY support_tickets_delete
  ON public.support_tickets FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.current_user_owner_admin_company_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- coupons — apenas master para gestão; autenticados leem cupons ativos (checkout)
-- ---------------------------------------------------------------------------
CREATE POLICY coupons_select
  ON public.coupons FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      active = true
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

CREATE POLICY coupons_write
  ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY coupons_update
  ON public.coupons FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY coupons_delete
  ON public.coupons FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE POLICY notifications_select
  ON public.notifications FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.current_user_company_ids())
    )
  );

CREATE POLICY notifications_insert
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY notifications_update
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY notifications_delete
  ON public.notifications FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- WhatsApp — somente owner/admin + master (staff não acessa credenciais)
-- ---------------------------------------------------------------------------
CREATE POLICY whatsapp_connections_select
  ON public.whatsapp_connections FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_connections_insert
  ON public.whatsapp_connections FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_connections_update
  ON public.whatsapp_connections FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_connections_delete
  ON public.whatsapp_connections FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_templates_all
  ON public.whatsapp_templates FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_logs_select
  ON public.whatsapp_message_logs FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_logs_insert
  ON public.whatsapp_message_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id IN (SELECT public.current_user_owner_admin_company_ids())
  );

CREATE POLICY whatsapp_logs_update
  ON public.whatsapp_message_logs FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY whatsapp_logs_delete
  ON public.whatsapp_message_logs FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Grants (RPCs públicas + helpers só autenticados)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_owner_admin_company_ids() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_booking_page_data(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(
  text, uuid, date, time, text, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_booking_page_data(text) IS 'Fase 3: leitura pública da empresa ativa por slug (JSON).';
COMMENT ON FUNCTION public.create_public_booking IS 'Fase 3: cria agendamento público validando slug e serviço; sem bypass de company_id.';
COMMENT ON FUNCTION public.is_platform_admin() IS 'Fase 3: membro do painel master (tabela platform_admins).';
