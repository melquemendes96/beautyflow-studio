#!/usr/bin/env bash
# Corrige build de produção: remove sb_publishable do bundle (VPS).
set -euo pipefail

ROOT="${1:-/var/www/beautyflow-studio}"
cd "$ROOT"

bash scripts/validate-supabase-env.sh

echo ""
echo "==> Variáveis VITE_SUPABASE nos env ativos"
ls -la .env .env.production .env.local 2>/dev/null || true
grep -hE "^VITE_SUPABASE" .env .env.production .env.local 2>/dev/null || true

echo "==> Limpando caches"
rm -rf dist .vite node_modules/.vite

echo "==> npm ci && npm run build"
npm ci
npm run build

echo "==> Verificação"
if grep -rE 'sb_publishable_[A-Za-z0-9_-]+' dist/ 2>/dev/null; then
  echo "FALHA: chave sb_publishable ainda embutida no dist/"
  grep -rE 'sb_publishable_[A-Za-z0-9_-]+' dist/ | head -5
  grep -R "sb_publishable" . --exclude-dir=node_modules --exclude-dir=dist | head -20
  exit 1
fi
echo "OK: sb_publishable removido do build"

grep -r "supabase.co" dist/ 2>/dev/null | head -3 || true

echo "==> PM2"
pm2 restart beautyflow --update-env 2>/dev/null || pm2 restart all --update-env
pm2 status
