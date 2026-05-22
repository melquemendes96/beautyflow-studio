# Relatório — Agendamento público → Agenda admin

## Causa raiz

Dois problemas combinados:

1. **UI da agenda (dia)** — A grade fixa só exibia horários **cheios** (`08:00` … `18:00`). O link público oferece slots a cada **15 minutos** (`10:15`, `10:30`, …). Agendamentos fora da hora cheia existiam em `appointments`, mas **não apareciam** no mapa `dayEventsByTime` (chave `10:30` ≠ linha `10:00`).

2. **Normalização de horário/data** — O admin usava `String(appointment_time).slice(0, 5)`, que falha quando o PostgREST devolve TIME como ISO (`1970-01-01T10:00:00…` → chave `1970-`). Na visão **semana**, `appointment_date` serializado com timezone também podia não bater com `toYmd(day)`.

3. **Confirmação no front** — Sucesso era `ok !== false` sem exigir `appointment_id`, permitindo tela “confirmado” sem insert.

4. **Notificações** — O sino admin só listava pagamentos e chamados; **não** agendamentos.

A RPC `create_public_booking` já insería em `public.appointments` (mesma tabela da agenda). O gap principal era **exibição + notificação**, não tabela separada.

## Correções

### SQL (`20260520000000_fix_public_booking_appointments.sql`)

- `get_available_slots` e `create_public_booking` com `timezone = America/Sao_Paulo`
- Validação de slot com o mesmo slug normalizado do booking
- `appointment_time` normalizado (`v_time`)
- Resposta com `appointment_id`, `company_id`, data e horário
- Erro explícito se insert não retornar id

**Aplicar em produção:**

```bash
supabase db push --linked
# ou SQL Editor: executar o arquivo da migration
```

### Frontend

| Arquivo | Mudança |
|---------|---------|
| `src/lib/appointment-time.ts` | Helpers de data/hora + parse da RPC |
| `src/services/publicBookingService.ts` | `createBooking` async, hora `HH:MM`, parse da resposta |
| `src/routes/agendar.$slug.tsx` | Sucesso só com `appointment_id` |
| `src/routes/admin.agenda.tsx` | Slots dinâmicos, contato do cliente, refetch 30s, erro de carga |
| `src/services/appointmentService.ts` | `listRecentByCompany` |
| `src/components/admin/AdminNotificationsBell.tsx` | “Novo agendamento recebido” + link `/admin/agenda` |
| `src/routes/admin.index.tsx` | Horário normalizado no dashboard |

## Tabela / RPC

- **Tabela:** `public.appointments` (única fonte da agenda admin)
- **RPC:** `create_public_booking`, `get_available_slots`
- **Status inicial:** `scheduled` (igual ao agendamento manual no admin)

## Testes executados

| # | Teste | Resultado |
|---|--------|-----------|
| 1 | `node scripts/appointment-time.test.mjs` | OK |
| 2 | `node scripts/public-booking-slug.test.mjs` | OK (existente) |
| 3 | `npm run build` | OK (verify-production-build passou) |
| 4–7 | E2E manual (`/agendar/ma-barbearia`, Supabase, `/admin/agenda`, slot bloqueado, mobile) | **Pendente no ambiente com Supabase + migration aplicada** |

### Checklist manual pós-deploy SQL

1. `/agendar/ma-barbearia` → agendar 26/05 10:00 (ou 10:30)
2. Supabase → linha em `appointments` com `company_id`, `client_id`, `service_id`, data, hora, `scheduled`
3. `/admin/agenda` → selecionar **26/05** → card com horário, nome, serviço, status, WhatsApp/e-mail
4. Mesmo horário **não** aparece em slots públicos
5. Sino admin → toast “Novo agendamento recebido”

## Critério de sucesso

No dia escolhido, a agenda admin mostra card com horário, cliente, serviço, status e contato; o horário some do link público.
