-- Corrige acentuação em features_catalog e re-sincroniza plans.features (bullets marketing).
BEGIN;

UPDATE public.features_catalog SET name = 'Agenda' WHERE key = 'agenda';
UPDATE public.features_catalog SET name = 'Clientes' WHERE key = 'clients';
UPDATE public.features_catalog SET name = 'Serviços' WHERE key = 'services';
UPDATE public.features_catalog SET name = 'Página pública' WHERE key = 'public_booking';
UPDATE public.features_catalog SET name = 'Histórico' WHERE key = 'history';
UPDATE public.features_catalog SET name = 'Aparência da marca' WHERE key = 'branding';
UPDATE public.features_catalog SET name = 'Lista de espera' WHERE key = 'waitlist';
UPDATE public.features_catalog SET name = 'Relatórios' WHERE key = 'reports';
UPDATE public.features_catalog SET name = 'WhatsApp' WHERE key = 'whatsapp';
UPDATE public.features_catalog SET name = 'Automação' WHERE key = 'automation';
UPDATE public.features_catalog SET name = 'Financeiro' WHERE key = 'finance';

DO $$
DECLARE
  pid uuid;
BEGIN
  FOR pid IN SELECT id FROM public.plans LOOP
    PERFORM public.sync_plan_marketing_features(pid);
  END LOOP;
END $$;

COMMIT;
