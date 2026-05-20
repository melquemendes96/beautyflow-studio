-- Garante platform_admins para e-mails master conhecidos (sem alterar RLS de outras tabelas).
INSERT INTO public.platform_admins (user_id)
SELECT u.id
FROM auth.users u
WHERE lower(u.email) IN (
  'melquemendes96@gmail.com',
  'melquemendes98@gmail.com'
)
ON CONFLICT (user_id) DO NOTHING;
