import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { AdminEmptyState, AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Building2,
  Eye,
  MessageCircle,
  ShoppingCart,
  UserPlus,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/master/trafego")({
  component: MasterTrafego,
});

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const EVENT_LABELS: Record<string, string> = {
  demo_view: "Demo",
  whatsapp_click: "WhatsApp",
  signup_start: "Início cadastro",
  signup_complete: "Conta criada",
  company_created: "Empresa criada",
  purchase: "Checkout (cliente)",
  payment_confirmed: "Pagamento confirmado",
};

function MasterTrafego() {
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ["master", "marketing_funnel", days],
    queryFn: async () => {
      const res = await masterService.getMarketingFunnelSummary(days);
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) throw new Error(data.error ?? "Erro ao carregar funil.");
      return data;
    },
    staleTime: 30_000,
  });

  const summary = query.data?.summary;
  const cards = [
    { label: "Demonstrações", value: summary?.demo_views, icon: Eye },
    { label: "Cliques WhatsApp", value: summary?.whatsapp_clicks, icon: MessageCircle },
    { label: "Inícios de cadastro", value: summary?.signup_starts, icon: UserPlus },
    { label: "Contas criadas", value: summary?.signup_completes, icon: UserPlus },
    { label: "Empresas criadas", value: summary?.companies_created, icon: Building2 },
    { label: "Pagamentos", value: summary?.payments_confirmed, icon: ShoppingCart },
    {
      label: "Receita confirmada",
      value: summary ? formatBrl(Number(summary.revenue_confirmed ?? 0)) : undefined,
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <MasterPageTitle
          title="Tráfego e funil"
          subtitle="Eventos críticos no banco (demo, WhatsApp, cadastro, pagamento) para cruzar com GA4/Meta Ads."
        />
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={days === d ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setDays(d)}
            >
              {d} dias
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <BarChart3 className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
          <span>
            Visitas totais e audiência de anúncios ficam no <strong>Google Analytics 4</strong> e no{" "}
            <strong>Meta Ads</strong> (configure <code className="text-xs">VITE_GA4_MEASUREMENT_ID</code> e{" "}
            <code className="text-xs">VITE_META_PIXEL_ID</code>). Aqui você vê conversões no funil do BeautyFlow.
          </span>
        </p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <AdminKpiCardSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <AdminEmptyState
          title="Não foi possível carregar o funil"
          description="Aplique a migration marketing_funnel_events no Supabase e tente de novo."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden />
                    {c.label}
                  </div>
                  <div className="mt-2 font-display text-2xl">{c.value ?? "—"}</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <h2 className="font-display text-lg">Por origem (UTM)</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Use <code className="text-[10px]">?utm_source=meta&utm_campaign=...</code> nos anúncios.
              </p>
              {(query.data?.by_utm_source?.length ?? 0) === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">Nenhum evento no período.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-2 pr-3 font-medium">Origem</th>
                        <th className="pb-2 pr-3 font-medium">Eventos</th>
                        <th className="pb-2 pr-3 font-medium">WhatsApp</th>
                        <th className="pb-2 pr-3 font-medium">Cadastros</th>
                        <th className="pb-2 font-medium">Receita</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {query.data?.by_utm_source?.map((row) => (
                        <tr key={row.utm_source}>
                          <td className="py-2.5 pr-3 font-medium">{row.utm_source}</td>
                          <td className="py-2.5 pr-3">{row.events}</td>
                          <td className="py-2.5 pr-3">{row.whatsapp_clicks}</td>
                          <td className="py-2.5 pr-3">{row.signups}</td>
                          <td className="py-2.5">{formatBrl(Number(row.revenue ?? 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <h2 className="font-display text-lg">Eventos recentes</h2>
              {(query.data?.recent?.length ?? 0) === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">Aguardando primeiros eventos.</p>
              ) : (
                <ul className="mt-4 max-h-[22rem] space-y-2 overflow-y-auto">
                  {query.data?.recent?.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-xl border border-border/70 bg-secondary/20 px-3 py-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">
                          {EVENT_LABELS[ev.event_name] ?? ev.event_name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[ev.utm_source, ev.utm_campaign, ev.path].filter(Boolean).join(" · ") || "—"}
                        {ev.amount != null ? ` · ${formatBrl(Number(ev.amount))}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
