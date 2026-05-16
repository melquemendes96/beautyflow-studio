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

if [ ! -f .env ] && [ ! -f .env.production ]; then
  echo "AVISO: Crie .env com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY antes do build."
fi

if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only || git pull
fi

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

echo "==> PM2 (srvx na porta 3000)"
mkdir -p logs
if pm2 describe beautyflow-studio >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 delete all 2>/dev/null || true
  pm2 start ecosystem.config.cjs
fi
pm2 save

sleep 2
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || echo "000")
echo "==> curl localhost:3000 => HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "500" ]; then
  echo "ERRO: app não respondeu. Veja: pm2 logs beautyflow-studio --lines 50"
  exit 1
fi

echo "==> OK. Teste o domínio no browser. Nginx: sudo nginx -t && sudo systemctl reload nginx"
