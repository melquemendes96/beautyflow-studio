# Deploy — Planos, Master e Cadastro

## Diagnóstico (causas)

| Sintoma | Causa |
|--------|--------|
| `/cadastro` "Try again" | Build VPS antigo (`authLoading` indefinido) ou deploy sem `git pull` |
| `/master/planos` erro | `ensure_platform_admin` bloqueava gate; 401 JWT; ou RPC/RLS |
| `sb_publishable` no `dist` | `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` embutida pelo Vite |

## Supabase (obrigatório)

1. SQL Editor → rodar `20260516800000_master_plans_authorization_fix.sql`
2. SQL Editor → rodar `20260516900000_platform_admin_email_bootstrap.sql`
3. Conferir:

```sql
SELECT proname FROM pg_proc
WHERE proname IN (
  'ensure_platform_admin','list_public_plans','master_list_plans',
  'master_create_plan','master_update_plan','master_delete_plan'
);

SELECT u.email FROM platform_admins pa
JOIN auth.users u ON u.id = pa.user_id;
```

## VPS `/var/www/beautyflow-studio`

```bash
cd /var/www/beautyflow-studio
git pull
mv -f .env.backup .env.backup.old 2>/dev/null || true
bash scripts/validate-supabase-env.sh
rm -rf dist .vite node_modules/.vite
npm ci && npm run build
grep -rE 'sb_publishable_[A-Za-z0-9_-]+' dist/ || echo "OK: build limpo"
pm2 restart all --update-env
```

## `.env` (somente)

```env
VITE_SUPABASE_URL=https://rfdphonjgsmyeqnsfjom.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_PROJECT_ID=rfdphonjgsmyeqnsfjom
```

Sem `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Testes

- [ ] `/` e `/#planos`
- [ ] `/cadastro` e `/cadastro?planId=<uuid>`
- [ ] `/master/planos` lista e CRUD
- [ ] `/master/empresas`
- [ ] `/demo`, `/agendar/:slug`
