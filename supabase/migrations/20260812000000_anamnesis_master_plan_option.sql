-- Garante Anamnese no catálogo do Master e facilita liberar nos planos.
-- Idempotente: seguro reaplicar se 20260811 já rodou.

BEGIN;

INSERT INTO public.features_catalog (key, name, description, category)
VALUES (
  'anamnesis',
  'Anamnese',
  'Ficha de anamnese da cliente (OTP/senha), exigência por serviço e histórico no admin.',
  'growth'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Pro / Elite / Profissional: ON por padrão
INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, 'anamnesis', true
FROM public.plans p
WHERE
  lower(p.name) LIKE '%elite%'
  OR lower(p.name) LIKE '%pro%'
  OR lower(p.name) LIKE '%profissional%'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true;

-- Demais planos ativos: cadastra como OFF para aparecer no Master e poder ligar
INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, 'anamnesis', false
FROM public.plans p
WHERE p.active = true
  AND NOT (
    lower(p.name) LIKE '%elite%'
    OR lower(p.name) LIKE '%pro%'
    OR lower(p.name) LIKE '%profissional%'
  )
ON CONFLICT (plan_id, feature_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
