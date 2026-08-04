-- Corrige seed de 20260601000000: commissions foi gravado como enabled=false
-- para planos Elite (fc.key IN ('team','packages') excluía commissions).
-- Sem isso, /admin/repasses redireciona para upgrade mesmo no Elite.

BEGIN;

INSERT INTO public.features_catalog (key, name, description, category)
VALUES (
  'commissions',
  'Comissões',
  'Repasses e comissões por prestador.',
  'elite'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, 'commissions', true
FROM public.plans p
WHERE lower(p.name) LIKE '%elite%'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

COMMIT;
