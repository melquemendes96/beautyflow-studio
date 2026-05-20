-- PREVIEW — limpeza de cadastros de teste (NÃO executar sem revisar).
-- Preserva obrigatoriamente:
--   melquemendes96@gmail.com (platform_admin)
--   melquebaruch@gmail.com + empresa MA Barbearia (slug ma-barbearia)
--
-- Uso: rode só os SELECTs primeiro; depois descomente DELETEs se concordar.

-- 1) Usuários que SERIAM removidos (auth.users)
SELECT u.id, u.email, u.created_at
FROM auth.users u
WHERE lower(u.email) NOT IN (
  'melquemendes96@gmail.com',
  'melquebaruch@gmail.com'
)
ORDER BY u.created_at DESC;

-- 2) Empresas que SERIAM removidas (exceto MA Barbearia)
SELECT c.id, c.name, c.slug, c.email, c.created_at
FROM public.companies c
WHERE c.slug <> 'ma-barbearia'
ORDER BY c.created_at DESC;

-- 3) Contagem por tabela (filhas de companies / users de teste)
SELECT 'company_users' AS tbl, count(*) AS cnt
FROM public.company_users cu
JOIN public.companies c ON c.id = cu.company_id
WHERE c.slug <> 'ma-barbearia';

-- Descomente abaixo SOMENTE após validar os SELECTs acima.
/*
BEGIN;

DELETE FROM public.companies
WHERE slug <> 'ma-barbearia';

DELETE FROM auth.users
WHERE lower(email) NOT IN (
  'melquemendes96@gmail.com',
  'melquebaruch@gmail.com'
);

COMMIT;
*/
