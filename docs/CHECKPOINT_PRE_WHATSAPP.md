# Checkpoint — pré-integração Meta WhatsApp

**Tag Git:** `pre-whatsapp-2026-05-22`  
**Branch de referência:** `pre-whatsapp-integration`  
**Commit:** `0200a9efd5afbbd36cea52896ea41a99d49886ec`  
**Mensagem:** `fix: corrigir ensureProfile no login` (inclui planos, notificações, agenda, encoding)

Use este ponto para **voltar o código** ou **recomeçar** a Fase WhatsApp sem perder o SaaS estável de go-live.

---

## O que está incluído neste checkpoint

| Área | Estado |
|------|--------|
| Agendamento público → agenda admin | OK (migration `20260520000000`) |
| Pós-agendamento cliente (ICS, portal, reagendar) | OK |
| Bloqueios agenda admin | OK |
| Acentos nos planos (front + migration `20260520100000`) | OK |
| Scroll notificações admin/master | OK |
| Mercado Pago + webhook + `payment_logs` | Validado em produção (Zeze Cortes paid, MA Barbearia active) |
| Feature flags planos (`plan_features`) | Migrations no repo |
| WhatsApp Meta | Apenas esqueleto: schema, `/admin/whatsapp` placeholder, `meta-whatsapp-webhook` (POST não processa envio) |

---

## Migrations relevantes (aplicar/confirmar no Supabase antes de WhatsApp)

Ordem sugerida se restaurar banco vazio:

1. `20260518000000_payment_logs.sql`
2. `20260518100000_plan_features_catalog.sql`
3. `20260518200000_fase_d_go_live_hardening.sql`
4. `20260520000000_fix_public_booking_appointments.sql`
5. `20260520100000_fix_plan_features_encoding.sql`

---

## Restaurar só o código

```powershell
cd "C:\Users\Melque\Documents\TRABALHO\Joyce Mendes Beauty\beautyflow-studio"
git fetch origin --tags
git checkout pre-whatsapp-2026-05-22
npm ci
npm run build
```

Na VPS (`/var/www/beautyflow-studio`):

```bash
git fetch origin --tags
git checkout pre-whatsapp-2026-05-22
npm ci
npm run build
pm2 restart all   # ou o nome do app no ecosystem.config.cjs
```

---

## Iniciar integração WhatsApp (branch isolada)

```powershell
git checkout main
git pull origin main
git checkout -b feature/whatsapp-meta-integration
```

Não desenvolver WhatsApp direto em `main` até a fase 1 (credenciais + 1 template de confirmação) estar estável.

---

## Backup do banco (manual — não versionar dumps com dados)

1. Supabase Dashboard → Database → Backups / PITR (se disponível).
2. SQL Editor: executar `supabase/scripts/pre_venda_snapshot_critical_tables.sql` e exportar resultados.
3. Opcional com CLI linkada:

   ```bash
   npx supabase db dump --linked -f backups/beautyflow-pre-whatsapp-2026-05-22.sql
   ```

   (Crie pasta `backups/` local e adicione ao `.gitignore` se usar dumps.)

---

## Secrets (não commitar)

| Secret | Uso no checkpoint |
|--------|-------------------|
| `MERCADO_PAGO_ACCESS_TOKEN` | Produção `APP_USR-…` |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Webhook MP |
| `META_APP_SECRET` | A configurar na Fase WhatsApp |
| `VITE_SUPABASE_*` | VPS build |

---

## Rollback rápido da Fase WhatsApp

1. `git checkout pre-whatsapp-2026-05-22` (ou `main` se já mergeou e quer só reverter commits).
2. Redeploy VPS + Edge Functions da tag.
3. Se migrations WhatsApp forem criadas depois: reverter só com migration down ou restore PITR — documentar em `docs/WHATSAPP_FASE_E.md` quando existir.

---

*Criado automaticamente no checkpoint pré-WhatsApp.*
