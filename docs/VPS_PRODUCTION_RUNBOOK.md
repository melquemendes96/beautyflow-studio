# BeautyFlow — deploy produção VPS (definitivo)

## O que estava quebrado

| Erro | Por quê |
|------|---------|
| `502 Bad Gateway` (Nginx) | Nada escutando em `127.0.0.1:3000` |
| `curl localhost:3000` falha com PM2 "online" | PM2 rodava processo errado |
| `node dist/server/server.js` | Esse arquivo só exporta `fetch` (SSR). **Não abre porta.** |
| `npm run preview` / `vite preview` | Modo dev do Vite; procura `server.js` via plugin de preview — **não é produção** |
| `mv server-*.js → server.js` | `server-XXXX.js` em `dist/server/assets/` são **chunks**, não o entrypoint |

## Entrypoint correto

| Papel | Caminho |
|-------|---------|
| Handler SSR (build) | `dist/server/server.js` |
| Chunks SSR | `dist/server/assets/*.js` |
| Assets estáticos | `dist/client/` |
| **Servidor HTTP em produção** | `srvx serve --prod --dir ./dist/server --static ../client` |

Comando único de produção: **`npm run start`** (ou PM2 apontando para `srvx` — ver `ecosystem.config.cjs`).

---

## Comandos na VPS (copiar e colar)

Substitua apenas se o diretório for outro.

```bash
set -e
cd /var/www/beautyflow-studio

# Node 22+
node -v   # deve ser >= 22.12

# Código + dependências + build
git pull origin main   # ou sua branch
npm ci
npm run build          # postbuild valida dist/server/server.js + dist/client

# Limpar PM2 antigo (preview, node server.js, nome "beautyflow" errado)
pm2 delete all 2>/dev/null || true
mkdir -p logs

# Subir com ecosystem do repositório (srvx na porta 3000)
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # execute o comando que o PM2 imprimir (systemd)

# Testes locais (obrigatório antes de testar o domínio)
sleep 2
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/login | head -c 200
echo ""

pm2 logs beautyflow-studio --lines 30 --nostream
```

Se `curl` retornar `HTTP 200` ou `HTTP 307`, o app está OK. Depois:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Teste: `https://jmbeautyflow.tech`

---

## Nginx (referência)

Proxy para o Node na 3000:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name jmbeautyflow.tech www.jmbeautyflow.tech;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

(SSL: Certbot no mesmo `server_name`.)

---

## Atualização de release

```bash
cd /var/www/beautyflow-studio
git pull
npm ci
npm run build
pm2 reload ecosystem.config.cjs --update-env
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/
```

---

## Diagnóstico rápido

```bash
pm2 list
pm2 describe beautyflow-studio | grep -E "script path|exec cwd|status|restarts"
ss -tlnp | grep 3000
ls -la dist/server/server.js dist/client/assets
pm2 logs beautyflow-studio --lines 50
sudo tail -20 /var/log/nginx/error.log
```

**Não use** na VPS: `npm run preview`, `vite preview`, `node dist/server/server.js`.
