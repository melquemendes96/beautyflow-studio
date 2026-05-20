#!/usr/bin/env bash

# Deploy produção na VPS — BeautyFlow Studio

# Uso: cd /var/www/beautyflow-studio && bash scripts/vps-deploy.sh

set -euo pipefail



APP_DIR="${APP_DIR:-/var/www/beautyflow-studio}"

cd "$APP_DIR"



echo "==> Diretório: $(pwd)"



NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")

if [ "$NODE_MAJOR" -lt 22 ]; then

  echo "ERRO: Node >= 22.12 necessário. Atual: $(node -v 2>/dev/null || echo 'não instalado')"

  exit 1

fi



bash scripts/validate-supabase-env.sh



if [ -d .git ]; then

  echo "==> git pull"

  git pull --ff-only || git pull

fi



echo "==> Limpando caches de build"

rm -rf dist .vite node_modules/.vite



echo "==> npm ci"

npm ci



echo "==> npm run build"

npm run build



if grep -rE 'sb_publishable_[A-Za-z0-9_-]+' dist/ 2>/dev/null; then

  echo "ERRO: sb_publishable ainda presente no dist/. Verifique .env e código."

  exit 1

fi

echo "OK: build sem sb_publishable no bundle"

if grep -rl 'authLoading' dist/client/assets/cadastro-*.js 2>/dev/null; then
  echo "ERRO: bundle /cadastro ainda contém authLoading (crash em produção). Abortando deploy."
  exit 1
fi
echo "OK: bundle cadastro sem authLoading"



echo "==> PM2 (srvx na porta 3000)"

mkdir -p logs

if pm2 describe beautyflow-studio >/dev/null 2>&1; then

  pm2 reload ecosystem.config.cjs --update-env

elif pm2 describe beautyflow >/dev/null 2>&1; then

  pm2 reload beautyflow --update-env

else

  pm2 delete all 2>/dev/null || true

  pm2 start ecosystem.config.cjs

fi

pm2 save



sleep 2

HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || echo "000")

echo "==> curl localhost:3000 => HTTP $HTTP_CODE"



if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "500" ]; then

  echo "ERRO: app não respondeu. Veja: pm2 logs --lines 50"

  exit 1

fi



echo "==> OK. Teste o domínio no browser. Nginx: sudo nginx -t && sudo systemctl reload nginx"

