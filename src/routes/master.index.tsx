import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { DashboardRangeReport } from "@/components/shared/DashboardRangeReport";
import { IntelligentCalendarPicker } from "@/components/shared/IntelligentCalendarPicker";
import { useAuth } from "@/contexts/AuthProvider";
import { AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  endOfMonth,
  startOfMonth,
  toYmd,
  useIntelligentCalendarRange,
  type DashboardRangeDay,
} from "@/lib/intelligent-calendar-range";
import { cn } from "@/lib/utils";
import { masterService } from "@/services/masterService";
import {
  ArrowUpRight,
  Building2,
  LifeBuoy,
  RefreshCw,
  Ticket,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Sparkles,
  Repeat,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/master/")({
  component: MasterDashboard,
});

function couponDiscountLabel(type: string | null | undefined, value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "—";
  if (type === "percent") return `${num}%`;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type MasterKpiFilter = "today" | "week" | "month" | "companies" | "subscriptions" | "mrr" | null;

function MasterDashboard() {
  const { companyMemberships } = useAuth();
  const hasCompanyPanel = companyMemberships.length > 0;
  const calendar = useIntelligentCalendarRange("today");

  const summaryQuery = useQuery({
    queryKey: ["master", "dashboard", "summary"],
    queryFn: async () => {
      const res = await masterService.getDashboardSummary();
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) throw new Error(data.error ?? "Erro ao carregar painel.");
      return data;
    },
    staleTime: 30_000,
  });

  const rangeQuery = useQuery({
    queryKey: ["master", "dashboard", "range", calendar.queryStart, calendar.queryEnd],
    queryFn: async () => {
      const res = await masterService.getDashboardRange(calendar.queryStart, calendar.queryEnd);
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) throw new Error(data.error ?? "Erro ao carregar período.");
      return data;
    },
    staleTime: 15_000,
    retry: 1,
  });

  const monthStartYmd = toYmd(startOfMonth(calendar.calendarMonth));
  const monthEndYmd = toYmd(endOfMonth(calendar.calendarMonth));

  const monthActivityQuery = useQuery({
    queryKey: ["master", "dashboard", "month", monthStartYmd, monthEndYmd],
    queryFn: async () => {
      const res = await masterService.getDashboardRange(monthStartYmd, monthEndYmd);
      if (res.error) throw res.error;
      return res.data;
    },
    staleTime: 60_000,
  });

  const couponsQuery = useQuery({
    queryKey: ["master", "coupons"],
    queryFn: async () => {
      const res = await masterService.listCoupons();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const subsQuery = useQuery({
    queryKey: ["master", "subscriptions"],
    queryFn: async () => {
      const res = await masterService.listSubscriptions();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const ticketsQuery = useQuery({
    queryKey: ["master", "support_tickets"],
    queryFn: async () => {
      const res = await masterService.listSupportTickets();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    staleTime: 30_000,
  });

  const summary = summaryQuery.data?.summary;

  const activityByDate = useMemo(() => {
    const map = new Map<string, DashboardRangeDay>();
    for (const day of monthActivityQuery.data?.days ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [monthActivityQuery.data?.days]);

  const applyKpiFilter = (filter: MasterKpiFilter) => {
    if (!filter || filter === "companies" || filter === "subscriptions" || filter === "mrr") return;
    calendar.setActiveKpi(filter);
    calendar.applyPreset(filter);
  };

  const activeCoupons = useMemo(() => {
    const now = Date.now();
    return (couponsQuery.data ?? []).filter((c: { active?: boolean; expires_at?: string | null }) => {
      if (!c.active) return false;
      if (!c.expires_at) return true;
      return new Date(c.expires_at).getTime() > now;
    });
  }, [couponsQuery.data]);

  const mrrByPlan =
    subsQuery.data
      ?.filter((s: { status?: string }) => s.status === "active" || s.status === "trialing")
      .reduce(
        (acc: Record<string, { name: string; mrr: number; count: number }>, s: {
          plan_id?: string;
          plans?: { name?: string; price?: number };
        }) => {
          const key = s.plan_id ?? "sem_plano";
          const name = s.plans?.name ?? "Sem plano";
          const price = s.plans?.price != null ? Number(s.plans.price) : 0;
          const cur = acc[key] ?? { name, mrr: 0, count: 0 };
          cur.mrr += price;
          cur.count += 1;
          acc[key] = cur;
          return acc;
        },
        {},
      ) ?? {};

  const mrrEntries = Object.entries(mrrByPlan).sort((a, b) => b[1].mrr - a[1].mrr);
  const maxMrr = Math.max(1, ...mrrEntries.map(([, v]) => v.mrr));

  const openTickets = (ticketsQuery.data ?? []).filter(
    (t: { status?: string }) => t.status === "open" || t.status === "in_progress",
  ).length;
  const urgentTickets = (ticketsQuery.data ?? []).filter(
    (t: { status?: string; priority?: string }) =>
      (t.status === "open" || t.status === "in_progress") && t.priority === "urgent",
  ).length;

  const topCardsLoading = summaryQuery.isLoading;

  const stats = [
    {
      id: "companies" as const,
      icon: Building2,
      label: "Empresas",
      value: summary ? String(summary.companies_count) : "—",
      sub: "Total cadastradas",
      disabled: true,
      accent: "gold" as const,
    },
    {
      id: "subscriptions" as const,
      icon: Repeat,
      label: "Assinaturas ativas",
      value: summary ? String(summary.active_subscriptions) : "—",
      sub: summary?.past_due_subscriptions
        ? `${summary.past_due_subscriptions} em atraso`
        : "Ativas ou em teste",
      disabled: true,
      accent: "ivory" as const,
    },
    {
      id: "mrr" as const,
      icon: TrendingUp,
      label: "MRR estimado",
      value: summary ? formatBrl(summary.mrr) : "—",
      sub: "Soma dos planos ativos",
      disabled: true,
      accent: "gold" as const,
    },
    {
      id: "today" as const,
      icon: Wallet,
      label: "Recebido hoje",
      value: summary ? formatBrl(summary.today_payments) : "—",
      sub: summary ? `${summary.today_new_companies} empresa(s) nova(s)` : "",
      disabled: false,
      accent: "live" as const,
    },
    {
      id: "week" as const,
      icon: Sparkles,
      label: "Recebido na semana",
      value: summary ? formatBrl(summary.week_payments) : "—",
      sub: "Pagamentos confirmados",
      disabled: false,
      accent: "ivory" as const,
    },
    {
      id: "month" as const,
      icon: Ticket,
      label: "Recebido no mês",
      value: summary ? formatBrl(summary.month_payments) : "—",
      sub: summary
        ? `${summary.upcoming_renewals_30d} renovação(ões) em 30d · ${formatBrl(summary.upcoming_renewal_revenue_30d)}`
        : "",
      disabled: false,
      accent: "gold" as const,
    },
  ];

  const quickLinks = [
    { to: "/master/pagamentos" as const, label: "Pagamentos", hint: "Confirmar recebimentos", icon: Wallet },
    { to: "/master/renovacoes" as const, label: "Renovações", hint: "Urgentes e trials", icon: RefreshCw },
    { to: "/master/assinaturas" as const, label: "Assinaturas", hint: "Planos e status", icon: Repeat },
    { to: "/master/suporte" as const, label: "Suporte", hint: `${openTickets} protocolo(s) ativos`, icon: LifeBuoy },
    { to: "/master/inadimplentes" as const, label: "Inadimplentes", hint: "Risco de churn", icon: AlertTriangle },
    { to: "/master/empresas" as const, label: "Empresas", hint: "Cadastro e slugs", icon: Building2 },
  ];

  return (
    <div className="relative">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-gold/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-80 w-80 rounded-full bg-charcoal/10 blur-3xl"
      />

      <MasterPageTitle
        title="Painel master"
        subtitle="Comando da plataforma — receita, risco e operação em um só olhar."
      />

      {summaryQuery.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar o painel master.
        </p>
      ) : (
        <>
          {/* Hero command strip */}
          <section className="relative overflow-hidden rounded-[2rem] border border-charcoal/20 bg-charcoal text-primary-foreground shadow-elegant">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                background:
                  "radial-gradient(ellipse 80% 60% at 15% 20%, oklch(0.78 0.085 82 / 0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, oklch(0.55 0.04 80 / 0.35), transparent 50%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(oklch(1 0 0 / 0.15) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.15) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />

            <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
                  BeautyFlow · Command Center
                </p>
                <h2 className="mt-3 max-w-xl font-display text-3xl leading-tight sm:text-4xl">
                  A plataforma em movimento — com elegância e controle.
                </h2>
                <p className="mt-3 max-w-lg text-sm text-primary-foreground/70">
                  Filtre o calendário, confirme pagamentos, antecipe renovações e feche protocolos sem sair do
                  ritmo.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button
                    asChild
                    className="rounded-full bg-gold text-charcoal hover:bg-gold/90"
                  >
                    <Link to="/master/pagamentos">
                      Registrar pagamento
                      <ArrowUpRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    <Link to="/master/suporte">Abrir suporte</Link>
                  </Button>
                  {hasCompanyPanel ? (
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                    >
                      <Link to="/admin">Painel da empresa</Link>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <HeroMetric
                  label="MRR"
                  value={summary ? formatBrl(summary.mrr) : "—"}
                  hint="recorrente"
                />
                <HeroMetric
                  label="Hoje"
                  value={summary ? formatBrl(summary.today_payments) : "—"}
                  hint="recebido"
                />
                <HeroMetric
                  label="Risco"
                  value={String(summary?.past_due_subscriptions ?? 0)}
                  hint="em atraso"
                  warn={(summary?.past_due_subscriptions ?? 0) > 0}
                />
                <HeroMetric
                  label="Suporte"
                  value={String(openTickets || summary?.open_tickets || 0)}
                  hint={urgentTickets > 0 ? `${urgentTickets} urgente(s)` : "protocolos"}
                  warn={urgentTickets > 0}
                />
              </div>
            </div>
          </section>

          {/* KPI mosaic */}
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {topCardsLoading
              ? Array.from({ length: 6 }).map((_, i) => <AdminKpiCardSkeleton key={`master-kpi-${i}`} />)
              : stats.map((s, idx) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={s.disabled}
                    onClick={() => !s.disabled && applyKpiFilter(s.id)}
                    style={{ animationDelay: `${idx * 40}ms` }}
                    className={cn(
                      "group relative overflow-hidden rounded-3xl border p-6 text-left shadow-soft transition duration-300",
                      "animate-in fade-in slide-in-from-bottom-2 fill-mode-both",
                      s.accent === "gold" && "border-gold/25 bg-gradient-to-br from-card via-card to-gold-soft/40",
                      s.accent === "ivory" && "border-border bg-card",
                      s.accent === "live" && "border-charcoal/15 bg-card",
                      !s.disabled && "hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-elegant",
                      calendar.activeKpi === s.id && "border-gold ring-2 ring-gold/30",
                      s.disabled && "cursor-default",
                    )}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-gold/10 opacity-0 blur-2xl transition group-hover:opacity-100"
                    />
                    <div className="relative flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {s.label}
                      </span>
                      <span className="grid size-9 place-items-center rounded-2xl border border-border/80 bg-background/80 text-foreground">
                        <s.icon className="size-4" />
                      </span>
                    </div>
                    <div className="relative mt-4 font-display text-3xl tracking-tight text-foreground">{s.value}</div>
                    <p className="relative mt-1.5 text-sm text-muted-foreground">{s.sub}</p>
                    {!s.disabled ? (
                      <p className="relative mt-3 text-[11px] font-medium text-gold opacity-0 transition group-hover:opacity-100">
                        Filtrar no calendário →
                      </p>
                    ) : null}
                  </button>
                ))}
          </div>

          {/* Quick ops */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quickLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-4 rounded-3xl border border-border bg-card/90 p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-elegant"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-charcoal text-primary-foreground transition group-hover:bg-gold group-hover:text-charcoal">
                  <item.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-gold" />
              </Link>
            ))}
          </div>

          {/* Calendar intelligence */}
          <div className="mt-8 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
            <div className="rounded-[1.75rem] border border-border bg-card/95 p-2 shadow-elegant">
              <IntelligentCalendarPicker
                selected={calendar.calendarSelected}
                onSelectDay={calendar.handleDayClick}
                onMonthChange={calendar.setCalendarMonth}
                activityByDate={activityByDate}
                hint="Toque em um dia ou intervalo para ver receita realizada e renovações projetadas."
              />
            </div>

            <div className="min-w-0">
              {rangeQuery.isError ? (
                <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6">
                  <p className="font-display text-xl text-foreground">Não foi possível carregar este período</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {(rangeQuery.error as Error)?.message ||
                      "Verifique a sessão master e se a função platform_dashboard_range está no Supabase."}
                  </p>
                  <Button
                    className="mt-4 rounded-full"
                    variant="outline"
                    onClick={() => void rangeQuery.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <DashboardRangeReport
                  queryStart={calendar.queryStart}
                  queryEnd={calendar.queryEnd}
                  isSingleDay={calendar.isSingleDay}
                  isRange={calendar.isRange}
                  isLoading={rangeQuery.isLoading}
                  isError={false}
                  data={rangeQuery.data}
                  primaryField="revenue"
                  labels={{
                    realizedTitle: "Já recebido",
                    realizedHint: "Pagamentos confirmados antes de hoje no intervalo",
                    todayRealizedTitle: "Hoje — já recebido",
                    todayPendingTitle: "Hoje — renovações previstas",
                    upcomingTitle: "A receber (projetado)",
                    upcomingHint: "Renovações com vencimento após hoje no intervalo",
                    primaryLabel: "Receita",
                    secondaryLabel: "Novas empresas",
                    countLabel: "Pagamentos / eventos",
                    singleFutureTitle: "Projetado",
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Bottom intelligence grid */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                MRR por plano
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Distribuição da receita recorrente</p>
            </div>
            <Link to="/master/planos" className="text-xs font-medium text-gold hover:underline">
              Planos →
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {subsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
            ) : mrrEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem assinaturas ativas com plano.</p>
            ) : (
              mrrEntries.map(([key, v]) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{v.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBrl(v.mrr)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-charcoal to-gold transition-all duration-700"
                      style={{ width: `${Math.max(8, (v.mrr / maxMrr) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{v.count} assinatura(s)</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Cupons ativos
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Códigos válidos agora</p>
            </div>
            <Link to="/master/cupons" className="text-xs font-medium text-gold hover:underline">
              Gerenciar →
            </Link>
          </div>
          <div className="mt-5">
            {couponsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : activeCoupons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cupom ativo no momento.</p>
            ) : (
              <ul className="space-y-2">
                {activeCoupons.slice(0, 6).map((c: { id: string; code: string; discount_type?: string; discount_value?: unknown }) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/80 px-3 py-2.5 text-sm"
                  >
                    <span className="font-mono font-medium tracking-wide">{c.code}</span>
                    <span className="shrink-0 text-gold">
                      {couponDiscountLabel(c.discount_type, c.discount_value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-charcoal/15 bg-charcoal p-6 text-primary-foreground shadow-elegant">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-gold/25 blur-2xl"
          />
          <div className="relative">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Risco & suporte</div>
            <p className="mt-3 font-display text-2xl leading-snug">
              {(summary?.past_due_subscriptions ?? 0) > 0
                ? `${summary?.past_due_subscriptions} assinatura(s) em atraso`
                : "Nenhuma assinatura em atraso"}
            </p>
            <p className="mt-2 text-sm text-primary-foreground/65">
              {openTickets > 0
                ? `${openTickets} protocolo(s) de suporte em aberto${urgentTickets ? ` · ${urgentTickets} urgente(s)` : ""}.`
                : "Fila de suporte limpa no momento."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-gold text-charcoal hover:bg-gold/90">
                <Link to="/master/inadimplentes">Ver inadimplentes</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link to="/master/suporte">Abrir suporte</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 px-4 py-3 backdrop-blur-sm",
        warn && "border-warning/40 bg-warning/10",
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary-foreground/55">{label}</div>
      <div className="mt-1 font-display text-xl text-primary-foreground">{value}</div>
      <div className="text-[11px] text-primary-foreground/55">{hint}</div>
    </div>
  );
}
