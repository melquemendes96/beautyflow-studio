# Relatório — preparação produção VPS (BeautyFlow Studio)

Data de referência: alterações aplicadas nesta sessão para deploy **Ubuntu + Node SSR + PM2 + Nginx + SSL**, sem mudar fluxos de negócio, UI ou integrações Supabase/Mercado Pago existentes.

## Status

| Área | Status |
|------|--------|
| Build produção (`npm run build`) | OK — saída `dist/client` + `dist/server` |
| Start produção (`npm run start`) | OK — **srvx** + handler `fetch` em `dist/server/server.js` |
| Cloudflare Worker no build | **Desativado** (`cloudflare: false` no `vite.config.ts`) — build voltado ao runtime Node |
| PM2 | `ecosystem.config.cjs` pronto |
| Nginx + SSL + firewall | Documentado em `docs/DEPLOY_VPS_UBUNTU.md` |
| Webhook MP assinatura | `MERCADO_PAGO_WEBHOOK_SECRET` opcional; se definido, valida `x-signature` (POST obrigatório; GET IPN legado sem assinatura gera aviso) |
| WhatsApp Meta (preparação) | Nova Edge Function `meta-whatsapp-webhook` + `docs/META_WHATSAPP_CLOUD_API.md`; tabelas **já existentes** (`whatsapp_connections`, etc.) |

## Arquivos alterados / adicionados

| Arquivo | Alteração |
|---------|-----------|
| `vite.config.ts` | `cloudflare: false` — preserva `@lovable.dev/vite-tanstack-config` e TanStack Start; só remove plugin Cloudflare no build |
| `package.json` | `engines.node`, `start`, scripts deploy Meta, dependência `srvx` |
| `wrangler.jsonc` | Comentário JSONC sobre uso opcional/Legacy |
| `supabase/config.toml` | `[functions.meta-whatsapp-webhook] verify_jwt = false` |
| `supabase/functions/mercado-pago-webhook/index.ts` | Corpo POST como texto + validação HMAC opcional |
| `supabase/functions/meta-whatsapp-webhook/index.ts` | **Novo** — GET `hub.challenge` multi-tenant + POST com assinatura Meta opcional |
| `ecosystem.config.cjs` | **Novo** — PM2 |
| `docs/DEPLOY_VPS_UBUNTU.md` | **Novo** — guia passo a passo |
| `docs/META_WHATSAPP_CLOUD_API.md` | **Novo** — Meta Cloud API |
| `.env.example` | Reescrito com seções Vite / Node / Edge secrets |
| `SUPABASE_SETUP.md` | Secções webhook MP + Meta |
| `.gitignore` | Pasta `logs/` (PM2) |

## O que foi preservado

- SSR TanStack Start, rotas, `src/server.ts` (wrapper de erro SSR), Supabase cliente, checkout Mercado Pago via Edge Functions, multi-tenant, RLS, design e telas.

## Detalhe técnico — `srvx` e pasta estática

O `srvx` resolve `--static` **em relação** a `--dir` quando ambos são passados. Por isso o script usa `--dir ./dist/server` e `--static ../client` (equivalente a `./dist/client` na raiz do repo).

## Próximos passos (operacionais, fora do código)

1. Na VPS: Node 22+, `npm ci`, `.env` com `VITE_*`, `npm run build`, PM2 + Nginx conforme `docs/DEPLOY_VPS_UBUNTU.md`.
2. Supabase: `supabase db push` / migrations; secrets `MERCADO_PAGO_WEBHOOK_SECRET`, `ALLOWED_APP_ORIGINS`; deploy das três functions.
3. Meta: configurar webhook com `company_id`; secret `META_APP_SECRET`.
4. Implementar envio de mensagens e persistência em `whatsapp_message_logs` quando o produto liberar (fora do escopo desta preparação).
