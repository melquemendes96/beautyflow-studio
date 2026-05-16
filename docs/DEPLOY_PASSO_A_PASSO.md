# BeautyFlow — passo a passo: rodar na VPS com domínio

Domínio: **https://jmbeautyflow.tech**  
Pasta na VPS: **/var/www/beautyflow-studio**

---

## Visão geral (3 camadas)

```
Internet → Nginx (443/80) → Node srvx (porta 3000) → dist/server + dist/client
                                    ↑
                              PM2 mantém rodando
```

- **Nginx**: recebe o domínio e repassa para `127.0.0.1:3000`
- **PM2 + srvx**: servidor real (`npm run start`), **não** `vite preview` nem `node dist/server/server.js`
- **Supabase**: banco/auth na nuvem (fora da VPS)

---

## PARTE A — No seu PC (Windows)

### A1. Enviar código para o GitHub

No projeto local (`beautyflow-studio`):

```powershell
cd "C:\Users\Melque\Documents\TRABALHO\Joyce Mendes Beauty\beautyflow-studio"
git status
git add .
git commit -m "deploy: ecosystem srvx e guia VPS"
git push origin main
```

(Use o nome da sua branch se não for `main`.)

### A2. Conferir arquivos importantes no repositório

- `ecosystem.config.cjs` — PM2 com **srvx**
- `package.json` — script `"start": "srvx serve ..."`
- `.env.example` — modelo das variáveis

---

## PARTE B — No Cursor (SSH na VPS)

### B1. Abrir a pasta do projeto

1. Conecte: **SSH: beautyflow-studio-vps**
2. **Arquivo → Abrir pasta** → `/var/www/beautyflow-studio`
3. Terminal: deve mostrar algo como `root@srv...:/var/www/beautyflow-studio#`

Se o prompt estiver em `~`, rode:

```bash
cd /var/www/beautyflow-studio
```

### B2. Node.js 22+

```bash
node -v
```

Precisa **v22.12** ou superior. Se for menor:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v
```

### B3. Arquivo `.env` na VPS (obrigatório antes do build)

```bash
cd /var/www/beautyflow-studio
nano .env
```

Cole (com seus valores reais do Supabase → Settings → API):

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

Salve: `Ctrl+O`, Enter, `Ctrl+X`.

**Atenção:** a URL do Supabase deve estar **completa** (ex.: `rfdphonjgsmyeqnsfjom.supabase.co` — com o `g`).

### B4. Deploy (um bloco — copiar e colar)

```bash
cd /var/www/beautyflow-studio
bash scripts/vps-deploy.sh
```

Ou manualmente:

```bash
cd /var/www/beautyflow-studio
git pull origin main
npm ci
npm run build
mkdir -p logs
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 2
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/
pm2 list
```

**Sucesso:** `HTTP 200` ou `HTTP 307`.

### B5. PM2 após reinício da VPS

Na primeira vez, depois de `pm2 save`:

```bash
pm2 startup
```

Copie e execute o comando `sudo env PATH=...` que o PM2 imprimir.

---

## PARTE C — Nginx + domínio

### C1. DNS (painel Hostinger / domínio)

| Tipo | Nome | Valor |
|------|------|--------|
| A | `@` | IP da sua VPS |
| A | `www` | IP da sua VPS |

Aguarde propagação (minutos a algumas horas).

### C2. Site Nginx

```bash
sudo nano /etc/nginx/sites-available/beautyflow
```

Conteúdo mínimo:

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
    }
}
```

Ativar e testar:

```bash
sudo ln -sf /etc/nginx/sites-available/beautyflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### C3. HTTPS (SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d jmbeautyflow.tech -d www.jmbeautyflow.tech
```

### C4. Teste final

1. `curl -I https://jmbeautyflow.tech` → não deve ser 502
2. Abra no navegador: login, home

---

## PARTE D — Supabase (Auth no domínio)

No [Supabase Dashboard](https://supabase.com) → **Authentication** → **URL Configuration**:

- **Site URL:** `https://jmbeautyflow.tech`
- **Redirect URLs:** inclua:
  - `https://jmbeautyflow.tech/**`
  - `https://www.jmbeautyflow.tech/**`
  - `https://jmbeautyflow.tech/login`
  - `https://jmbeautyflow.tech/cadastro`

---

## Atualizar o site depois (rotina)

**PC:** `git push`  
**VPS:**

```bash
cd /var/www/beautyflow-studio
bash scripts/vps-deploy.sh
sudo systemctl reload nginx
```

---

## Problemas comuns

| Sintoma | Causa | Solução |
|---------|--------|---------|
| 502 Bad Gateway | Nada na porta 3000 | `pm2 start ecosystem.config.cjs` + `curl localhost:3000` |
| PM2 online, curl falha | Rodou `node server.js` ou preview | Use só `ecosystem.config.cjs` (srvx) |
| Site antigo | Build não rodou | `npm run build` + `pm2 reload ecosystem.config.cjs` |
| Login Google falha | URLs no Supabase | Parte D |
| App sem dados | `.env` errado no build | Corrija `.env`, `npm run build`, reload PM2 |

Logs:

```bash
pm2 logs beautyflow-studio --lines 80
sudo tail -30 /var/log/nginx/error.log
```

---

## O que NÃO usar em produção

- `npm run preview`
- `vite preview`
- `node dist/server/server.js`
- `mv dist/server/assets/server-*.js` para `server.js`

Detalhes técnicos: `docs/VPS_PRODUCTION_RUNBOOK.md`
