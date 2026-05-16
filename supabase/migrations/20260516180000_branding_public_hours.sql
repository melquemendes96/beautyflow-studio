-- Horário exibido na página pública de agendamento (texto livre, ex.: "Seg–Sáb · 09h às 19h")
ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS public_hours_text TEXT;

COMMENT ON COLUMN public.branding_settings.public_hours_text IS
  'Horário de funcionamento exibido na página pública /agendar/:slug.';
