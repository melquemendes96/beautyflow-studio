import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService, type MarketingFunnelSummary } from "@/services/masterService";
import { AdminEmptyState, AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Building2,
  Eye,
  Filter,
  MessageCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/master/trafego")({
  component: MasterTrafego,
});

type BreakdownTab = "source" | "campaign" | "event";
type FeedFilter =
  | "all"
  | "demo_view"
  | "whatsapp_click"
  | "signup_start"
  | "signup_complete"
  | "company_created"
  | "payment_confirmed"
  | "challenge";

const EVENT_LABELS: Record<string, string> = {
  demo_view: "Demonstração",
  whatsapp_click: "Clique WhatsApp",
  signup_start: "Início de cadastro",
  signup_complete: "Conta criada",
  company_created: "Empresa criada",
  purchase: "Checkout (cliente)",
  payment_confirmed: "Pagamento confirmado",
  challenge_banner_view: "Banner desafio — view",
  challenge_banner_dismiss: "Banner desafio — dismiss",
  challenge_lead_submit: "Lead do desafio",
  challenge_signup: "Cadastro via desafio",
  challenge_activated: "Desafio ativado",
};

function eventLabel(name: string) {
  return EVENT_LABELS[name] ?? name;
}

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDay(value: string) {
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function pct(from: number, to: number) {
  if (!from || from <= 0) return null;
  return Math.round((to / from) * 1000) / 10;
}

function rateLabel(from: number, to: number) {
  const r = pct(from, to);
  return r == null ? "—" : `${r}%`;
}

function MasterTrafego() {
  const [days, setDays] = useState(30);
  const [breakdown, setBreakdown] = useState<BreakdownTab>("source");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["master", "marketing_funnel", days],
    queryFn: async () => {
      const res = await masterService.getMarketingFunnelSummary(days);
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) throw new Error(data.error ?? "Erro ao carregar funil.");
      return data as MarketingFunnelSummary;
    },
    staleTime: 30_000,
  });

  const summary = query.data?.summary;
  const daily = query.data?.daily ?? [];
  const recent = query.data?.recent ?? [];

  const funnelSteps = useMemo(() => {
    const demos = Number(summary?.demo_views ?? 0);
    const wa = Number(summary?.whatsapp_clicks ?? 0);
    const starts = Number(summary?.signup_starts ?? 0);
    const accounts = Number(summary?.signup_completes ?? 0);
    const companies = Number(summary?.companies_created ?? 0);
    const payments = Number(summary?.payments_confirmed ?? 0);
    const max = Math.max(demos, wa, starts, accounts, companies, payments, 1);
    return [
      { key: "demo_view" as const, label: "Demos", value: demos, max },
      { key: "whatsapp_click" as const, label: "WhatsApp", value: wa, max },
      { key: "signup_start" as const, label: "Início cadastro", value: starts, max },
      { key: "signup_complete" as const, label: "Contas", value: accounts, max },
      { key: "company_created" as const, label: "Empresas", value: companies, max },
      { key: "payment_confirmed" as const, label: "Pagamentos", value: payments, max },
    ];
  }, [summary]);

  const maxDailyEvents = useMemo(
    () => Math.max(1, ...daily.map((d) => Number(d.events ?? 0))),
    [daily],
  );
  const maxDailyRevenue = useMemo(
    () => Math.max(1, ...daily.map((d) => Number(d.revenue ?? 0))),
    [daily],
  );

  const filteredRecent = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recent.filter((ev) => {
      if (feedFilter === "challenge") {
        if (!ev.event_name.startsWith("challenge_")) return false;
      } else if (feedFilter !== "all" && ev.event_name !== feedFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        eventLabel(ev.event_name),
        ev.event_name,
        ev.path,
        ev.utm_source,
        ev.utm_medium,
        ev.utm_campaign,
        ev.utm_content,
        ev.amount != null ? String(ev.amount) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recent, feedFilter, search]);

  const kpiCards = [
    {
      id: "demo_view" as FeedFilter,
      label: "Demonstrações",
      value: summary?.demo_views,
      icon: Eye,
    },
    {
      id: "whatsapp_click" as FeedFilter,
      label: "Cliques WhatsApp",
      value: summary?.whatsapp_clicks,
      icon: MessageCircle,
    },
    {
      id: "signup_start" as FeedFilter,
      label: "Inícios de cadastro",
      value: summary?.signup_starts,
      icon: UserPlus,
    },
    {
      id: "signup_complete" as FeedFilter,
      label: "Contas criadas",
      value: summary?.signup_completes,
      icon: UserPlus,
    },
    {
      id: "company_created" as FeedFilter,
      label: "Empresas criadas",
      value: summary?.companies_created,
      icon: Building2,
    },
    {
      id: "payment_confirmed" as FeedFilter,
      label: "Pagamentos",
      value: summary?.payments_confirmed,
      icon: ShoppingCart,
    },
    {
      id: "all" as FeedFilter,
      label: "Receita confirmada",
      value: summary ? formatBrl(Number(summary.revenue_confirmed ?? 0)) : undefined,
      icon: Wallet,
      isMoney: true,
    },
    {
      id: "challenge" as FeedFilter,
      label: "Leads do desafio",
      value: summary?.challenge_leads ?? 0,
      icon: Sparkles,
    },
  ];

  return (
    <div className="relative space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-10 h-64 w-64 rounded-full bg-gold/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-32 h-72 w-72 rounded-full bg-charcoal/10 blur-3xl"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <MasterPageTitle
          title="Tráfego e funil"
          subtitle="Conversões reais no banco — cruzar com GA4/Meta Ads nos anúncios."
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] border border-charcoal/20 bg-charcoal px-5 py-6 text-primary-foreground shadow-elegant sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 15% 20%, oklch(0.78 0.085 82 / 0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, oklch(0.55 0.04 80 / 0.35), transparent 50%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold">Command center · marketing</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl">
              Últimos {days} dias
              {summary?.total_events != null ? (
                <span className="ml-2 text-lg font-normal text-primary-foreground/70">
                  · {summary.total_events} eventos
                </span>
              ) : null}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-primary-foreground/70">
              Funil de demo → WhatsApp → cadastro → pagamento. Visitas totais ficam no GA4/Meta.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <HeroStat
              label="Demo → WA"
              value={rateLabel(Number(summary?.demo_views ?? 0), Number(summary?.whatsapp_clicks ?? 0))}
            />
            <HeroStat
              label="WA → cadastro"
              value={rateLabel(
                Number(summary?.whatsapp_clicks ?? 0),
                Number(summary?.signup_starts ?? 0),
              )}
            />
            <HeroStat
              label="Início → conta"
              value={rateLabel(
                Number(summary?.signup_starts ?? 0),
                Number(summary?.signup_completes ?? 0),
              )}
            />
            <HeroStat
              label="Conta → pagamento"
              value={rateLabel(
                Number(summary?.signup_completes ?? 0),
                Number(summary?.payments_confirmed ?? 0),
              )}
            />
          </div>
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
        <span>
          Configure <code className="text-xs">VITE_GA4_MEASUREMENT_ID</code> e{" "}
          <code className="text-xs">VITE_META_PIXEL_ID</code> no deploy para anúncios. Aqui: conversões
          persistidas no BeautyFlow.
        </span>
      </p>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <AdminKpiCardSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <AdminEmptyState
          title="Não foi possível carregar o funil"
          description="Aplique as migrations de marketing_funnel_events e 20260807000000_master_marketing_funnel_upgrade.sql no Supabase."
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((c) => {
              const Icon = c.icon;
              const active = feedFilter === c.id;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setFeedFilter(c.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left shadow-soft transition-colors",
                    active
                      ? "border-charcoal bg-charcoal text-primary-foreground"
                      : "border-border bg-card hover:border-gold/40",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-2 text-xs font-medium uppercase tracking-wide",
                      active ? "text-gold" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {c.label}
                  </div>
                  <div className="mt-2 font-display text-2xl">{c.value ?? "—"}</div>
                </button>
              );
            })}
          </div>

          {/* Funnel */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg">Funil de conversão</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clique numa etapa para filtrar o feed de eventos.
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                <TrendingUp className="mr-1 size-3" />
                {days} dias
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {funnelSteps.map((step, idx) => {
                const next = funnelSteps[idx + 1];
                const width = Math.max(8, Math.round((step.value / step.max) * 100));
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setFeedFilter(step.key)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors",
                      feedFilter === step.key
                        ? "border-gold bg-gold/10"
                        : "border-border/80 bg-secondary/30 hover:bg-secondary/50",
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {step.label}
                    </div>
                    <div className="mt-1 font-display text-xl">{step.value}</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/60">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${width}%` }} />
                    </div>
                    {next ? (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        → {next.label}: {rateLabel(step.value, next.value)}
                      </p>
                    ) : (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Receita {formatBrl(Number(summary?.revenue_confirmed ?? 0))}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Daily series */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-display text-lg">Evolução diária</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Barras = eventos · linha dourada relativa = receita confirmada.
            </p>
            {daily.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">Sem série diária neste período.</p>
            ) : (
              <div className="mt-4 flex h-40 items-end gap-1 overflow-x-auto pb-1">
                {daily.map((d) => {
                  const ev = Number(d.events ?? 0);
                  const rev = Number(d.revenue ?? 0);
                  const h = Math.max(4, Math.round((ev / maxDailyEvents) * 100));
                  const goldH = Math.max(rev > 0 ? 6 : 0, Math.round((rev / maxDailyRevenue) * 100));
                  return (
                    <div
                      key={d.day}
                      className="group relative flex min-w-[1.35rem] flex-1 flex-col items-center justify-end gap-1"
                      title={`${formatDay(String(d.day))}: ${ev} eventos · ${formatBrl(rev)}`}
                    >
                      <div className="relative flex h-28 w-full items-end justify-center">
                        <div
                          className="w-[70%] rounded-t-md bg-charcoal/80 transition-opacity group-hover:opacity-90"
                          style={{ height: `${h}%` }}
                        />
                        {goldH > 0 ? (
                          <div
                            className="absolute bottom-0 w-[30%] rounded-t-sm bg-gold"
                            style={{ height: `${goldH}%` }}
                          />
                        ) : null}
                      </div>
                      <span className="max-w-full truncate text-[9px] text-muted-foreground">
                        {formatDay(String(d.day))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Breakdown */}
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg">Origens e campanhas</h2>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["source", "UTM source"],
                      ["campaign", "Campanhas"],
                      ["event", "Por tipo"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={breakdown === id ? "default" : "outline"}
                      className="h-8 rounded-full text-xs"
                      onClick={() => setBreakdown(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {breakdown === "source" ? (
                <BreakdownTable
                  empty="Nenhum evento no período."
                  rows={(query.data?.by_utm_source ?? []).map((row) => ({
                    key: row.utm_source,
                    title: row.utm_source,
                    events: row.events,
                    whatsapp: row.whatsapp_clicks,
                    signups: row.signups,
                    revenue: row.revenue,
                  }))}
                />
              ) : null}

              {breakdown === "campaign" ? (
                <BreakdownTable
                  empty="Nenhuma campanha no período."
                  rows={(query.data?.by_utm_campaign ?? []).map((row) => ({
                    key: `${row.utm_campaign}-${row.utm_source}`,
                    title: row.utm_campaign,
                    subtitle: row.utm_source,
                    events: row.events,
                    whatsapp: row.whatsapp_clicks,
                    signups: row.signups,
                    revenue: row.revenue,
                  }))}
                />
              ) : null}

              {breakdown === "event" ? (
                (query.data?.by_event?.length ?? 0) === 0 ? (
                  <p className="mt-6 text-sm text-muted-foreground">Nenhum tipo de evento.</p>
                ) : (
                  <ul className="mt-4 max-h-[22rem] space-y-2 overflow-y-auto">
                    {query.data?.by_event?.map((row) => (
                      <li
                        key={row.event_name}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/20 px-3 py-2.5 text-sm"
                      >
                        <div>
                          <div className="font-medium">{eventLabel(row.event_name)}</div>
                          <div className="text-[10px] text-muted-foreground">{row.event_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-display">{row.events}</div>
                          {Number(row.revenue) > 0 ? (
                            <div className="text-[10px] text-muted-foreground">
                              {formatBrl(Number(row.revenue))}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </section>

            {/* Recent feed */}
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg">Eventos recentes</h2>
                <Badge variant="outline" className="rounded-full">
                  <Filter className="mr-1 size-3" />
                  {filteredRecent.length}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar origem, path, campanha…"
                    className="h-9 rounded-full pl-9"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setFeedFilter("all");
                    setSearch("");
                  }}
                >
                  Limpar
                </Button>
              </div>
              {filteredRecent.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  Nenhum evento com este filtro.
                </p>
              ) : (
                <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto">
                  {filteredRecent.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-xl border border-border/70 bg-secondary/20 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{eventLabel(ev.event_name)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {ev.utm_source ? (
                          <Badge variant="secondary" className="rounded-full text-[10px]">
                            {ev.utm_source}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            direto
                          </Badge>
                        )}
                        {ev.utm_campaign ? (
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            {ev.utm_campaign}
                          </Badge>
                        ) : null}
                        {ev.amount != null ? (
                          <Badge className="rounded-full bg-gold/20 text-[10px] text-foreground">
                            {formatBrl(Number(ev.amount))}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[ev.path, ev.utm_medium, ev.utm_content].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Challenge strip */}
          {(Number(summary?.challenge_banner_views ?? 0) > 0 ||
            Number(summary?.challenge_leads ?? 0) > 0) && (
            <section className="grid gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4 sm:grid-cols-4">
              <ChallengeStat label="Views do banner" value={summary?.challenge_banner_views ?? 0} />
              <ChallengeStat label="Dismiss" value={summary?.challenge_banner_dismisses ?? 0} />
              <ChallengeStat label="Leads" value={summary?.challenge_leads ?? 0} />
              <ChallengeStat
                label="Ativações"
                value={summary?.challenge_activated ?? summary?.challenge_signups ?? 0}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-primary-foreground/55">{label}</div>
      <div className="mt-0.5 font-display text-lg text-gold">{value}</div>
    </div>
  );
}

function ChallengeStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-xl">{value}</div>
    </div>
  );
}

function BreakdownTable({
  rows,
  empty,
}: {
  empty: string;
  rows: Array<{
    key: string;
    title: string;
    subtitle?: string;
    events: number;
    whatsapp: number;
    signups: number;
    revenue: number;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
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
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-2.5 pr-3">
                <div className="font-medium">{row.title}</div>
                {row.subtitle ? (
                  <div className="text-[10px] text-muted-foreground">{row.subtitle}</div>
                ) : null}
              </td>
              <td className="py-2.5 pr-3">{row.events}</td>
              <td className="py-2.5 pr-3">{row.whatsapp}</td>
              <td className="py-2.5 pr-3">{row.signups}</td>
              <td className="py-2.5">{formatBrl(Number(row.revenue ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
