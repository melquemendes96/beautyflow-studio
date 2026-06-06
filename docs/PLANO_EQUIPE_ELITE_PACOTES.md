# Equipe Elite + Pacotes (Fases 1–5)

Plano de produto implementado até a Fase 5 (sem Comissões Fase 6 nem add-on MP Fase 7).

## Features (Plano Elite)

| Chave | UI |
|-------|-----|
| `team` | Admin → Equipe |
| `packages` | Serviços pacote + ativação em Clientes + fluxo público |

## Fluxo público

### Avulso
`Serviço → [Profissional se Equipe + >1 prestador] → Data/hora → Nome + WhatsApp`

### Pacote
`Serviço → Profissional → WhatsApp (lookup pacote) → Data/hora → Nome → Confirmado`

- WhatsApp do pacote **após** escolher o profissional.
- Contador de sessão ex.: `3/4`; alerta na última sessão.
- Calendário respeita `package_allowed_dow`, feriados (`company_holidays`) e `package_max_per_week`.

## Admin

- **`/admin/equipe`**: CRUD prestadores (limite 3 + add-ons futuros), serviços por prestador, **convite de acesso individual** (link 7 dias).
- **`/convite/prestador/:token`**: prestador cria login ou entra e vê só a própria agenda.
- **`/admin/servicos`**: tipo Avulso/Pacote + regras do pacote.
- **`/admin/clientes`**: ativar pacote pago (dialog ao editar cliente).
- **`/admin/agenda`**: filtro por prestador (dono) ou agenda automática do prestador logado.

## Migration

- `supabase/migrations/20260601000000_team_packages_foundation.sql`
- `supabase/migrations/20260603000000_provider_portal_invites.sql` (convites + painel prestador)

Após aplicar: `NOTIFY pgrst, 'reload schema';` (já incluído no arquivo).

## RPCs principais

- `list_public_providers`, `lookup_client_package`, `create_public_booking` (+ provider/package)
- `admin_list_service_providers`, `admin_upsert_service_provider`
- `admin_create_provider_invite`, `preview_provider_invite`, `accept_provider_invite`
- `admin_activate_client_package`, `admin_list_client_packages`
