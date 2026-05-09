-- Fase 2 — Schema multiempresa BeautyFlow Studio
-- RLS e políticas: Fase 3
-- Executar via Supabase CLI: supabase db push / migration up no dashboard

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.appointment_status AS ENUM (
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show'
);

CREATE TYPE public.schedule_block_type AS ENUM (
  'manual_block',
  'morning_full',
  'afternoon_full',
  'day_full'
);

CREATE TYPE public.company_user_role AS ENUM (
  'owner',
  'admin',
  'staff'
);

CREATE TYPE public.company_status AS ENUM (
  'active',
  'inactive',
  'suspended'
);

CREATE TYPE public.subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'paused'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'refunded'
);

CREATE TYPE public.coupon_discount_type AS ENUM (
  'percent',
  'fixed'
);

CREATE TYPE public.whatsapp_provider AS ENUM (
  'meta_cloud_api'
);

CREATE TYPE public.whatsapp_connection_status AS ENUM (
  'not_configured',
  'pending',
  'active',
  'error'
);

CREATE TYPE public.whatsapp_template_status AS ENUM (
  'draft',
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE public.support_ticket_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'closed'
);

CREATE TYPE public.support_ticket_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE public.waitlist_status AS ENUM (
  'waiting',
  'contacted',
  'converted',
  'expired',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Função updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- platform_admins (donos da plataforma — painel master)
-- ---------------------------------------------------------------------------
CREATE TABLE public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_admins_user_id ON public.platform_admins (user_id);

-- ---------------------------------------------------------------------------
-- plans (catálogo de planos SaaS)
-- ---------------------------------------------------------------------------
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plans_active ON public.plans (active) WHERE active = true;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  status public.company_status NOT NULL DEFAULT 'active',
  plan_id UUID REFERENCES public.plans (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companies_slug_format CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

CREATE INDEX idx_companies_plan_id ON public.companies (plan_id);
CREATE INDEX idx_companies_status ON public.companies (status);

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_users ( vínculo auth.users ↔ empresa + papel )
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.company_user_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX idx_company_users_company_id ON public.company_users (company_id);
CREATE INDEX idx_company_users_user_id ON public.company_users (user_id);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_company_id ON public.clients (company_id);
CREATE INDEX idx_clients_company_email ON public.clients (company_id, lower(email));

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- services (serviços oferecidos pela empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_company_id ON public.services (company_id);
CREATE INDEX idx_services_company_active ON public.services (company_id, active);

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'scheduled',
  confirmation_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_company_date ON public.appointments (company_id, appointment_date);
CREATE INDEX idx_appointments_company_datetime ON public.appointments (company_id, appointment_date, appointment_time);
CREATE INDEX idx_appointments_client ON public.appointments (client_id);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_blocks
-- ---------------------------------------------------------------------------
CREATE TABLE public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  time_start TIME,
  time_end TIME,
  block_type public.schedule_block_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schedule_blocks_times_check CHECK (
    (block_type = 'manual_block' AND time_start IS NOT NULL AND time_end IS NOT NULL)
    OR (block_type <> 'manual_block' AND time_start IS NULL AND time_end IS NULL)
  ),
  CONSTRAINT schedule_blocks_time_order CHECK (
    time_start IS NULL OR time_end IS NULL OR time_end > time_start
  )
);

CREATE INDEX idx_schedule_blocks_company_date ON public.schedule_blocks (company_id, block_date);

COMMENT ON COLUMN public.schedule_blocks.block_date IS 'Data do bloqueio (campo conceitual "date" do modelo; nome técnico evita palavra reservada).';

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------
CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services (id) ON DELETE SET NULL,
  guest_name TEXT,
  whatsapp TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TIME,
  notes TEXT,
  status public.waitlist_status NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_contact_check CHECK (
    client_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_name <> '')
  )
);

CREATE INDEX idx_waitlist_company ON public.waitlist (company_id, status);

CREATE TRIGGER trg_waitlist_updated_at
  BEFORE UPDATE ON public.waitlist
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- branding_settings (uma linha por empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.branding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies (id) ON DELETE CASCADE,
  logo_url TEXT,
  banner_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  background_color TEXT,
  brand_name TEXT,
  slogan TEXT,
  welcome_text TEXT,
  instagram_url TEXT,
  whatsapp TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_branding_settings_updated_at
  BEFORE UPDATE ON public.branding_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- business_settings (uma linha por empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE public.business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies (id) ON DELETE CASCADE,
  working_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  opening_time TIME,
  closing_time TIME,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
  min_schedule_notice_hours INTEGER NOT NULL DEFAULT 2 CHECK (min_schedule_notice_hours >= 0),
  cancellation_limit_hours INTEGER NOT NULL DEFAULT 6 CHECK (cancellation_limit_hours >= 0),
  allow_reschedule BOOLEAN NOT NULL DEFAULT true,
  allow_waitlist BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_settings_hours_check CHECK (
    opening_time IS NULL OR closing_time IS NULL OR closing_time > opening_time
  )
);

CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- appointment_ratings
-- ---------------------------------------------------------------------------
CREATE TABLE public.appointment_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id)
);

CREATE INDEX idx_appointment_ratings_company ON public.appointment_ratings (company_id);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans (id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX idx_subscriptions_plan ON public.subscriptions (plan_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions (status);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions (id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_company ON public.payments (company_id, created_at DESC);
CREATE INDEX idx_payments_subscription ON public.payments (subscription_id);

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies (id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_company ON public.support_tickets (company_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status);

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- coupons (plataforma — sem company_id no requisito original)
-- ---------------------------------------------------------------------------
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  discount_type public.coupon_discount_type NOT NULL,
  discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_max CHECK (
    discount_type <> 'percent' OR (discount_value >= 0 AND discount_value <= 100)
  )
);

CREATE UNIQUE INDEX idx_coupons_code_lower ON public.coupons (lower(code));

CREATE INDEX idx_coupons_active ON public.coupons (active) WHERE active = true;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications (user_id, read_at);
CREATE INDEX idx_notifications_company ON public.notifications (company_id);

-- ---------------------------------------------------------------------------
-- whatsapp_connections
-- ---------------------------------------------------------------------------
CREATE TABLE public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies (id) ON DELETE CASCADE,
  provider public.whatsapp_provider NOT NULL DEFAULT 'meta_cloud_api',
  business_id TEXT,
  phone_number_id TEXT,
  display_phone_number TEXT,
  access_token_encrypted TEXT,
  webhook_verify_token TEXT,
  status public.whatsapp_connection_status NOT NULL DEFAULT 'not_configured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_whatsapp_connections_updated_at
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- whatsapp_templates
-- ---------------------------------------------------------------------------
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_preview TEXT,
  status public.whatsapp_template_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_templates_company ON public.whatsapp_templates (company_id);

-- ---------------------------------------------------------------------------
-- whatsapp_message_logs
-- ---------------------------------------------------------------------------
CREATE TABLE public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments (id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  meta_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_logs_company ON public.whatsapp_message_logs (company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed: planos iniciais (valores alinhados ao produto)
-- ---------------------------------------------------------------------------
INSERT INTO public.plans (name, price, features, active)
VALUES
  (
    'Essencial Beauty',
    49.00,
    '[
      "Agenda online",
      "Cadastro de serviços",
      "Cadastro de clientes",
      "Histórico de atendimentos",
      "Página pública de agendamento",
      "Painel administrativo básico"
    ]'::jsonb,
    true
  ),
  (
    'Studio Pro',
    79.00,
    '[
      "Tudo do Essencial",
      "Personalização de marca, logo e cores",
      "Lista de espera",
      "Relatórios completos",
      "Bloqueio manhã / tarde / dia",
      "Área exclusiva do cliente"
    ]'::jsonb,
    true
  ),
  (
    'Elite Beauty',
    119.00,
    '[
      "Tudo do Studio Pro",
      "WhatsApp Oficial Meta",
      "Lembretes automáticos",
      "Dashboard avançado",
      "Suporte prioritário",
      "Recursos de automação"
    ]'::jsonb,
    true
  );

-- ---------------------------------------------------------------------------
-- Comentários (documentação no catálogo)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.platform_admins IS 'Usuários com acesso ao painel master da plataforma.';
COMMENT ON TABLE public.companies IS 'Tenant — cada empresa cliente do SaaS.';
COMMENT ON TABLE public.company_users IS 'Membros do painel da empresa (owner/admin/staff).';
COMMENT ON COLUMN public.whatsapp_connections.access_token_encrypted IS 'Armazenar token cifrado ou referência segura; nunca texto puro em produção.';
COMMENT ON SCHEMA public IS 'BeautyFlow Fase 2 — RLS na Fase 3.';
