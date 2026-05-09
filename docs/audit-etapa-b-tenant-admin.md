# Etapa B — Auditoria do painel empresa (`/admin`)

Guia para validar **login → empresa → plano → cobrança → uso do painel**. Use com `.env` preenchido e migrações Supabase aplicadas.

## 1. Árvore de rotas (todas filhas de `/admin`)

| Rota | Função |
|------|--------|
| `/admin` | Dashboard |
| `/admin/agenda` | Agenda |
| `/admin/clientes` | Clientes |
| `/admin/servicos` | Serviços |
| `/admin/lista-espera` | Lista de espera (plano) |
| `/admin/relatorios` | Relatórios (plano) |
| `/admin/branding` | Aparência |
| `/admin/whatsapp` | WhatsApp (plano) |
| `/admin/plano` | Plano e assinatura |
| `/admin/plano/checkout` | Checkout |
| `/admin/configuracoes` | Agenda / horários |

Aliases na raiz: `/checkout` → `/admin/plano/checkout`, `/pagamento` → `/admin/plano`, `/planos` → `/admin/plano`.

## 2. Guards (resumo)

Definidos em `src/routes/admin.tsx` + `src/lib/route-guards.ts`:

1. **`CompanyAdminRoute`** — sessão + linha em `company_users` (senão → `/login`).
2. **`guardCompanyTenantBillingAccess`** — empresa suspensa / sem assinatura / vencida / inadimplente redireciona para `/admin/plano` com `billing=*`.
3. **`guardCompanyPlanFeatureAccess`** — lista de espera, relatórios e WhatsApp exigem plano compatível (Studio Pro / Elite conforme `plan-access`).

**Sem linha em `tenant_subscriptions`:** só páginas de plano/checkout até iniciar trial ou checkout (redirect `billing=setup`).

**Com `past_due` ou `canceled`:** liberados também `/admin`, `/admin/branding`, `/admin/configuracoes`, `/admin/servicos` (configurar studio com cobrança pendente). Demais rotas → `/admin/plano?billing=renew`.

**Com `trialing` ou `active` e período válido:** painel completo (exceto rotas “premium” sem plano adequado).

## 3. Roteiro de testes manuais

### B1 — Primeiro acesso (empresa criada)

1. Cadastro/login até entrar no admin (ou fluxo que chama `user_bootstrap_company`).
2. Confirmar no Supabase: `company_users` com seu `user_id` e uma linha em `companies`.
3. Sem `tenant_subscriptions`: ao ir para `/admin` deve redirecionar para `/admin/plano` (`billing=setup`).
4. Em `/admin/plano` deve listar planos (`plans.active = true`).

**Falha comum:** nenhum plano no banco → Master deve criar planos em `/master/planos`.

### B2 — Trial

1. Em `/admin/plano`, escolher plano → **Iniciar teste** → completar checkout (dados de cobrança válidos).
2. Esperado: RPC `company_start_checkout` com `p_trial=true` → `tenant_subscriptions.status = trialing`, período ~7 dias, **sem** linha em `payment_transactions` pendente.
3. Navegar para `/admin`, `/admin/branding`, `/admin/servicos` → deve abrir sem loop de redirect.
4. Na página de plano **não** deve aparecer bloco “Pagamento simulado” (trial não gera cobrança pendente).

### B3 — Checkout pago (pendente)

1. Fluxo **sem** trial → PIX/cartão/boleto ou transferência manual conforme teste.
2. Esperado: `tenant_subscriptions` em `past_due`, `payment_transactions` com `status = pending`.
3. Bloco **Pagamento simulado** na página de plano → Aprovar → assinatura deve ir para `active` (RPC `company_simulate_payment_outcome`).
4. Ou testar retorno Mercado Pago (sandbox) + webhook.

### B4 — Configuração com cobrança pendente (`past_due`)

Com assinatura `past_due` e pagamento ainda não aprovado:

| URL | Deve abrir? |
|-----|-------------|
| `/admin` | Sim |
| `/admin/branding` | Sim |
| `/admin/configuracoes` | Sim |
| `/admin/servicos` | Sim |
| `/admin/agenda` | Não → redirect plano |
| `/admin/clientes` | Não → redirect plano |

Depois de cadastrar ≥1 serviço ativo: botão “Concluir configuração inicial” no dashboard deve chamar `company_mark_onboarding_complete` com sucesso.

### B5 — Recursos por plano

1. Com plano **Essencial**, abrir `/admin/lista-espera` ou `/admin/relatorios` ou `/admin/whatsapp` → esperado redirect para plano com `billing=upgrade` (se aplicável).
2. Com plano **Pro/Elite** (conforme nomes em `plans.name` e `plan-access.ts`) → páginas abrem.

## 4. Verificações rápidas no Supabase (SQL)

```sql
-- Sua assinatura atual (substituir USER_UUID)
select cu.company_id, ts.status, ts.current_period_end, ts.trial_used
from company_users cu
left join tenant_subscriptions ts on ts.company_id = cu.company_id
where cu.user_id = 'USER_UUID';

select * from payment_transactions
where company_id = (select company_id from company_users where user_id = 'USER_UUID' limit 1)
order by created_at desc limit 5;
```

## 5. Problemas frequentes

| Sintoma | Onde olhar |
|---------|------------|
| Loop ou sempre volta ao plano | `tenant_subscriptions` vazio, status `past_due`/`canceled`, empresa `suspended`, ou período trial expirado |
| Trial não inicia | RPC retorna `trial_ja_usado`; ou erro de validação no checkout (CPF/CNPJ, CEP, etc.) |
| Simular não aparece | Só existe com cobrança **pending**; trial não cria essa linha |
| “Sem empresa” no checkout | `company_users` ausente — rodar bootstrap ou fluxo de onboarding |

---

*Última revisão alinhada ao código em `route-guards.ts` e `admin.tsx`.*
