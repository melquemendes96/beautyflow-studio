# BeautyFlow Studio — deploy em VPS Ubuntu (Node SSR + PM2 + Nginx + SSL)

Este guia assume **Ubuntu 22.04 ou 24.04 LTS**, domínio apontando para o IP da VPS e acesso `ssh` como usuário com `sudo`.

## 1. O que roda onde

| Camada | Onde fica |
|--------|-----------|
| Frontend SSR + assets estáticos | **Sua VPS** (`npm run build` + `npm run start` com **srvx**) |
| Banco, Auth, Storage, Edge Functions | **Supabase** (projeto na nuvem) |

O app na VPS só precisa das variáveis **Vite** (`VITE_*`) no **momento do build** (ou no ambiente que executa `vite build`). Em runtime, o bundle já contém as URLs públicas do Supabase.

---

## 2. Requisitos de versão

- **Node.js ≥ 22.12** (alinhado a `@tanstack/react-start` no `package.json`).
- **npm** (vem com Node).

Instalação recomendada com **nvm**:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v
```

---

## 3. Firewall (UFW)

```bash
sudo apt update
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 4. Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Crie o site (troque `app.seudominio.com`):

```bash
sudo nano /etc/nginx/sites-available/beautyflow
```

Conteúdo:

```nginx
server {
    listen 80;
    server_name app.seudominio.com;

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

Ativar:

```bash
sudo ln -sf /etc/nginx/sites-available/beautyflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. SSL (Let’s Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.seudominio.com
```

Renovação automática costuma vir ativa:

```bash
sudo systemctl status certbot.timer
```

---

## 6. Deploy da aplicação

No servidor (ex.: diretório `/var/www/beautyflow-studio`):

```bash
sudo mkdir -p /var/www/beautyflow-studio
sudo chown -R $USER:$USER /var/www/beautyflow-studio
cd /var/www/beautyflow-studio
```

Copie o código (git clone ou rsync). Na **primeira vez** e a cada deploy de dependências:

```bash
npm ci
```

Crie `.env` ou `.env.production` na raiz com **pelo menos** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`). Opcional: `VITE_MERCADO_PAGO_PUBLIC_KEY`.

Build de produção:

```bash
npm run build
```

Subir o processo:

```bash
mkdir -p logs
npm run start
```

Ou com **PM2** (recomendado — usa **srvx**, não `node server.js`):

```bash
sudo npm install -g pm2
cd /var/www/beautyflow-studio
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# execute o comando que o PM2 imprimir (systemd)
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Variáveis úteis:

| Variável | Efeito |
|----------|--------|
| `PORT` | Porta HTTP do app (padrão **3000**; srvx lê `PORT` e `HOST`) |
| `HOST` | Bind (no `ecosystem.config.cjs` já está `0.0.0.0` via env do npm script) |

O script `start` usa **srvx** em modo produção, servindo:

- SSR: `./dist/server/server.js` (handler `fetch`)
- Estáticos: `../client` relativo ao `--dir` (ou seja, `./dist/client` na raiz do projeto)

---

## 7. Atualização (deploy novo)

**Produção = `srvx` (`npm run start`), nunca `vite preview` nem `node dist/server/server.js`.**

Guia completo de recuperação 502: **`docs/VPS_PRODUCTION_RUNBOOK.md`**

```bash
cd /var/www/beautyflow-studio
git pull
npm ci
npm run build
pm2 reload ecosystem.config.cjs --update-env
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/
```

---

## 8. Logs

```bash
pm2 logs beautyflow-studio
tail -f logs/pm2-error.log
sudo tail -f /var/log/nginx/error.log
```

---

## 9. Supabase (lembrar após mudar domínio)

1. **Authentication → URL Configuration**: incluir `https://app.seudominio.com/login`, `/cadastro`, etc.
2. **Edge Function** `create-mercado-pago-preference`: secret `ALLOWED_APP_ORIGINS` com o domínio **exato** (sem barra final).
3. Webhooks externos (Mercado Pago, Meta) continuam apontando para URLs **Supabase**, não para a VPS.

Detalhes: `SUPABASE_SETUP.md` e `docs/META_WHATSAPP_CLOUD_API.md`.
