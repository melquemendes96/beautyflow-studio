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

## 3. Roteiro de testes manuais (B1 → B5)

**Pré-requisitos gerais**

- `npm run dev` (ou build de staging) com `VITE_SUPABASE_URL` e chave anon válidas.
- No Supabase: pelo menos um registro em `plans` com `active = true` (criar via Master em `/master/planos` se necessário).
- Anotar o **e-mail da conta de teste** e, ao depurar, o `user_id` em Authentication → Users.

Use uma **planilha ou checklist** e marque cada item como OK / FALHA + print ou mensagem de erro.

---

### B1 — Primeiro acesso (empresa sem assinatura)

**Objetivo:** garantir vínculo `company_users` + redirect correto até escolher plano.

| # | Ação | Resultado esperado |
|---|------|-------------------|
| B1.1 | Criar conta em `/cadastro` (ou login em `/login`) e completar fluxo até o app redirecionar para o painel | Você chega em `/admin` ou `/admin/plano` sem erro de tela branca |
| B1.2 | Abrir DevTools → Application → Local Storage e confirmar sessão Supabase | Há sessão persistida para o projeto |
| B1.3 | No Supabase → Table Editor → `company_users` | Existe linha com seu `user_id` e `company_id` |
| B1.4 | Idem → `companies` | Existe linha com `id` = esse `company_id`, `status` não suspenso para teste feliz |
| B1.5 | Idem → `tenant_subscriptions` filtrando pelo `company_id` | **Antes** de qualquer checkout: **0 linhas** |
| B1.6 | Na barra de endereço ir para `/admin` | Redireciona para `/admin/plano` com parâmetro `billing=setup` (ou equivalente) |
| B1.7 | Permaneça em `/admin/plano` | Lista **cards de planos** com nome e preço (não mensagem “Nenhum plano disponível”) |
| B1.8 | Clicar num card (fluxo pago) sem trial — só até abrir checkout | Abre `/admin/plano/checkout?planId=…` com plano reconhecido na UI |

**Falhas típicas**

- **Nenhum plano:** popular `plans` no Master ou SQL.
- **Sem empresa:** `user_bootstrap_company` não rodou — ver fluxo pós-login e RPC no Network.
- **Redirect estranho:** conferir se usuário não é só Master (`platform_admins`).

---

### B2 — Período de teste (trial)

**Objetivo:** assinatura em `trialing` sem cobrança pendente; painel operacional nas rotas permitidas.

**Preparação:** concluir B1 (empresa existe, ainda sem assinatura ou resetar assinatura em ambiente de dev se necessário).

| # | Ação | Resultado esperado |
|---|------|-------------------|
| B2.1 | Em `/admin/plano`, escolher um plano e clicar **Iniciar teste** | Vai para `/admin/plano/checkout` com trial ativo na cópia da página (“Período de teste”) |
| B2.2 | Etapa 1: forma de pagamento qualquer | Botão Continuar habilitado |
| B2.3 | Etapa 2: preencher **todos** os dados com valores válidos BR (CPF/CNPJ, CEP 8 dígitos, telefone com DDD, UF 2 letras) | Sem toast “Corrija os campos” |
| B2.4 | Etapa 3: **Iniciar teste** | Toast de sucesso ou redirecionamento para `/admin/plano`; **sem** abrir Mercado Pago para métodos online no trial (comportamento atual) |
| B2.5 | Supabase → `tenant_subscriptions` | Uma linha: `status = trialing`, `current_period_end` ~7 dias à frente, `trial_used = true` |
| B2.6 | Supabase → `payment_transactions` para essa empresa | **Nenhuma** linha `pending` obrigatória para trial (trial não gera cobrança no fluxo atual) |
| B2.7 | Navegar `/admin`, `/admin/branding`, `/admin/servicos` | Páginas carregam **sem** voltar só para plano |
| B2.8 | Voltar a `/admin/plano` | **Não** deve aparecer bloco “Pagamento simulado (demonstração)”; pode aparecer texto explicando que no trial não há cobrança pendente |

**Falhas típicas**

- Toast “Este studio já usou o teste grátis” → `trial_used` já true no banco; usar outra empresa ou reset manual em dev.
- Erro genérico no submit → abrir Network → request ao RPC `company_start_checkout` e ler corpo/mensagem.

---

### B3 — Checkout pago + cobrança pendente + simulação

**Objetivo:** estado `past_due`, fatura `pending`, depois `active` via simulação (ou gateway).

**Preparação:** empresa com ou sem trial já usado; para testar **só fluxo pago**, pode usar segunda empresa ou plano diferente conforme regra `trial_ja_usado`.

| # | Ação | Resultado esperado |
|---|------|-------------------|
| B3.1 | Em `/admin/plano`, escolher plano e fluxo **sem** “Iniciar teste” (link inferior ou card → checkout pago) | Checkout com `trial` desligado na revisão |
| B3.2 | Escolher **Transferência (manual)** no método de pagamento | Ao finalizar, **não** redireciona ao Mercado Pago; volta ao `/admin/plano` |
| B3.3 | **Ou** escolher PIX/cartão/boleto | Se Edge Function + MP configurados: redirect para URL MP; senão pode falhar — anotar |
| B3.4 | Supabase → `tenant_subscriptions` | `status = past_due` após checkout inicial pago pendente |
| B3.5 | Supabase → `payment_transactions` | Pelo menos uma linha `status = pending` ligada à assinatura |
| B3.6 | Em `/admin/plano`, bloco **Pagamento simulado** | Visível com botões Aprovar / Pendente / Recusar |
| B3.7 | Clicar **Aprovar pagamento** | Toast de sucesso; em seguida `tenant_subscriptions.status` tende a **active** e período atualizado (conferir tabela) |
| B3.8 | Navegar `/admin/agenda` | **Deve abrir** após `active` e período válido (não mais bloqueado como só `past_due` sem pagamento) |

**Nota:** fluxo Mercado Pago real exige Edge Functions deployadas e secrets; para auditoria rápida use **transferência manual + simulação**.

---

### B4 — Configuração do studio com cobrança ainda pendente (`past_due`)

**Objetivo:** validar rotas liberadas pelo guard para marca/agenda/serviços enquanto pagamento não foi aprovado.

**Preparação:** estado após B3.6 **antes** de B3.7 (ainda `past_due` + `pending`), ou simular de novo com conta de teste.

| URL | Deve carregar a página? |
|-----|-------------------------|
| `/admin` | Sim |
| `/admin/branding` | Sim |
| `/admin/configuracoes` | Sim |
| `/admin/servicos` | Sim |
| `/admin/agenda` | **Não** — redirect para `/admin/plano` (`billing=renew`) |
| `/admin/clientes` | **Não** — idem |

| # | Ação | Resultado esperado |
|---|------|-------------------|
| B4.1 | Em `/admin/servicos`, criar **pelo menos um serviço ativo** | Lista mostra o serviço |
| B4.2 | Ir ao `/admin` (dashboard) | Card “Configure seu studio…” visível se `onboarding_completed = false` na empresa |
| B4.3 | Clicar **Concluir configuração inicial** | Toast de sucesso; em Supabase `companies.onboarding_completed = true` |

**Se B4.3 falhar com mensagem de serviço:** confirmar que há ≥1 serviço com `active = true`.

---

### B5 — Recursos condicionados ao nome do plano (`plan-access`)

**Onde está no código:** `src/lib/route-guards.ts` (`guardCompanyPlanFeatureAccess`) + `src/lib/plan-access.ts`.

Somente estas rotas são bloqueadas por **nome do plano** (não incluem branding no guard atual):

| Rota | Recurso | Libera se `plans.name` contém (normalizado em minúsculas) |
|------|---------|-----------------------------------------------------------|
| `/admin/lista-espera` | Lista de espera | “studio pro”, “stúdio pro”, “pro” (sem “elite” só para pro), ou “elite” |
| `/admin/relatorios` | Relatórios | Idem |
| `/admin/whatsapp` | WhatsApp | Somente **“elite”** no nome |

**Plano “Essencial” (nome sem pro/elite):** esperado redirect para `/admin/plano?billing=upgrade&need=…`.

| # | Ação | Resultado esperado |
|---|------|-------------------|
| B5.1 | Com assinatura **ativa/trialing** ligada a um plano cujo nome é tipo “Essencial” | Abrir `/admin/lista-espera` → redirect com `billing=upgrade` |
| B5.2 | Mesmo cenário | `/admin/relatorios` → idem |
| B5.3 | Mesmo cenário | `/admin/whatsapp` → upgrade pedindo WhatsApp |
| B5.4 | No Master, renomear/escolher plano com **“Studio Pro”** ou **“Elite”** no nome e associar à assinatura de teste | `/admin/lista-espera` e `/admin/relatorios` **abrem** |
| B5.5 | Plano **Elite** no nome | `/admin/whatsapp` **abre** |

**Dica:** nomes exatos vêm da tabela `plans`; alinhar com `plan-access.ts` (substring case-insensitive).

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

*Última revisão: roteiros B1–B5 detalhados; B5 alinhado a `guardCompanyPlanFeatureAccess` e `plan-access.ts`.*

