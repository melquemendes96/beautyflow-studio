# Relatório — Pós-agendamento do cliente

## Causa raiz

| Problema | Causa |
|----------|--------|
| Adicionar ao calendário | Botão sem `onClick` — decorativo |
| Voltar à página | `Link` TanStack para `/agendar/$slug` falhava em alguns contextos pós-confirmação |
| Ver meus atendimentos | `/cliente` sem `?slug=` e formulário pedia **slug do estúdio** |
| Reagendar | Dialog interno com input manual de data; não usava a agenda pública com slots reais |
| Pré-preenchimento | Dados do agendamento não eram persistidos após confirmar |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/calendar-ics.ts` | Geração e download `.ics` |
| `src/lib/client-portal-session.ts` | `sessionStorage` slug/contato + intent de reagendamento |
| `src/routes/agendar.$slug.tsx` | Calendário, links, reagendamento via agenda pública, sessão |
| `src/routes/cliente.tsx` | `?slug=` na URL, sem campo slug, reagendar → `/agendar/{slug}` |
| `scripts/calendar-ics.test.mjs` | Teste unitário |

## Funções / rotas

- **Rotas:** `/agendar/$slug` (`search.reagendar`), `/cliente` (`search.slug`, `auto`, `email`, `whatsapp`)
- **Helpers:** `buildAppointmentIcs`, `downloadAppointmentIcs`, `saveClientPortalSession`, `saveRescheduleIntent`
- **RPC (sem alteração):** `create_public_booking`, `client_reschedule_appointment`, `get_client_portal_data`, `get_available_slots`

## Escopo preservado

Não alterado: login SaaS, cadastro SaaS, master, planos, Mercado Pago, RLS, branding admin, serviços admin.

## Testes

| # | Teste | Resultado |
|---|--------|-----------|
| 1 | `node scripts/calendar-ics.test.mjs` | OK |
| 2 | `node scripts/appointment-time.test.mjs` | OK |
| 3 | `npm run build` | Ver terminal |

E2E manual (produção/local): confirmação → .ics → voltar → meus atendimentos → reagendar → admin agenda.
