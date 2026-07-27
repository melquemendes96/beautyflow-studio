# Marketing híbrido — GA4 + Meta Pixel + funil no Master

## Objetivo

- **GA4 / Meta**: otimizar anúncios e ver visitas/sessões
- **Master → Tráfego**: cadastros, WhatsApp, demos e pagamentos no banco (com UTM)

## 1. Variáveis no `.env` (VPS + local)

```env
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXX
VITE_META_PIXEL_ID=123456789012345
```

Sem esses IDs o site continua funcionando; só não carrega os pixels. Os eventos críticos ainda vão para o Supabase.

Depois de alterar: rebuild/deploy (`scripts/vps-deploy.sh`).

## 2. Migration

No SQL Editor do Supabase, rode:

`supabase/migrations/20260626100000_marketing_funnel_events.sql`

## 3. Links de anúncio (UTM)

Exemplo Meta:

```
https://jmbeautyflow.tech/?utm_source=meta&utm_medium=cpc&utm_campaign=planos_abril
```

Exemplo Google:

```
https://jmbeautyflow.tech/?utm_source=google&utm_medium=cpc&utm_campaign=brand
```

A atribuição fica na sessão do navegador e é enviada com os eventos.

## 4. Eventos

| Evento | GA4 | Meta | Banco (Master) |
|--------|-----|------|----------------|
| page_view | sim | PageView | não |
| demo_view | sim | ViewContent | sim |
| whatsapp_click | sim | Contact | sim |
| signup_start | sim | InitiateCheckout | sim |
| signup_complete | sim | CompleteRegistration | sim |
| purchase (checkout success) | sim | Purchase | sim |
| company_created | — | — | trigger SQL |
| payment_confirmed | — | — | trigger SQL |

## 5. WhatsApp corporativo

Número: `11920142382` → `https://wa.me/5511920142382`

Presente em: menu **Fale conosco**, rodapé, CTA final da home e botão flutuante.

## 6. Painel Master

Menu **Tráfego** (`/master/trafego`): resumo 7/30/90 dias, breakdown por `utm_source`, eventos recentes.

## 7. ROI rápido

1. Gasto em ads no Meta/Google no período  
2. No Master → Tráfego: `Receita confirmada` e `Empresas criadas`  
3. ROI ≈ (receita − gasto) / gasto  

Visitas e CPM/CPC ficam nos dashboards do GA4/Meta.
