-- Configura entrega Web Push em produção (rode após migration 20260617000000).
-- Substitua SEU_REF e os secrets antes de executar.

UPDATE public.platform_push_config
SET
  functions_base_url = 'https://SEU_REF.supabase.co',
  internal_secret = 'COLE_AQUI_MESMO_VALOR_DE_PUSH_INTERNAL_SECRET',
  updated_at = now()
WHERE id = 1;

SELECT id, functions_base_url IS NOT NULL AS url_ok, internal_secret IS NOT NULL AS secret_ok
FROM public.platform_push_config;
