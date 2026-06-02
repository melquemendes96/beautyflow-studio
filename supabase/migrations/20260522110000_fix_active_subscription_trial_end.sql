-- Limpa trial_end/trial_start obsoletos em assinaturas já pagas (evita falso "period_ended" no front).
-- O guard passou a ignorar trial_end quando status = active; este UPDATE corrige dados legados.

BEGIN;

UPDATE public.tenant_subscriptions
SET
  trial_start = NULL,
  trial_end = NULL,
  updated_at = now()
WHERE status = 'active'
  AND trial_end IS NOT NULL
  AND (
    current_period_end IS NULL
    OR trial_end < current_period_end
  );

COMMIT;
