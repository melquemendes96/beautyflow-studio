# Rollback — Fase A pré-venda

## Código

```bash
git checkout main
# ou
git revert <commit-da-fase-a>
```

Redeploy: `npm ci && npm run build && pm2 restart all --update-env`

## Banco (Supabase SQL Editor)

```sql
DROP TABLE IF EXISTS public.payment_logs CASCADE;
```

Não remove dados de `plans`, `companies` ou assinaturas.

## Edge Function

Redeploy da versão anterior de `mercado-pago-webhook` se o logging causar problema (improvável).
