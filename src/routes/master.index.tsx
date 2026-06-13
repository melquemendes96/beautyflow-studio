import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { DashboardRangeReport } from "@/components/shared/DashboardRangeReport";
import { IntelligentCalendarPicker } from "@/components/shared/IntelligentCalendarPicker";
import { useAuth } from "@/contexts/AuthProvider";
import { AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { Skeleton } from "@/components/ui/skeleton";
import {
  endOfMonth,
  startOfMonth,
  toYmd,
  useIntelligentCalendarRange,
  type DashboardRangeDay,
} from "@/lib/intelligent-calendar-range";
import { cn } from "@/lib/utils";
import { masterService } from "@/services/masterService";
import { Building2, Ticket, TrendingUp, Wallet } from "lucide-react";
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

  const topCardsLoading = summaryQuery.isLoading;

  const stats = [
    {
      id: "companies" as const,
      icon: Building2,
      label: "Empresas",
      value: summary ? String(summary.companies_count) : "—",
      sub: "Total cadastradas",
      disabled: true,
    },
    {
      id: "subscriptions" as const,
      icon: TrendingUp,
      label: "Assinaturas ativas",
      value: summary ? String(summary.active_subscriptions) : "—",
      sub: summary?.past_due_subscriptions
        ? `${summary.past_due_subscriptions} em atraso`
        : "Ativas ou em teste",
      disabled: true,
    },
    {
      id: "mrr" as const,
      icon: Wallet,
      label: "MRR estimado",
      value: summary ? formatBrl(summary.mrr) : "—",
      sub: "Soma dos planos ativos",
      disabled: true,
    },
    {
      id: "today" as const,
      icon: Wallet,
      label: "Recebido hoje",
      value: summary ? formatBrl(summary.today_payments) : "—",
      sub: summary ? `${summary.today_new_companies} empresa(s) nova(s)` : "",
      disabled: false,
    },
    {
      id: "week" as const,
      icon: TrendingUp,
      label: "Recebido na semana",
      value: summary ? formatBrl(summary.week_payments) : "—",
      sub: "Pagamentos confirmados",
      disabled: false,
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
    },
  ];

  return (
    <div>
      <MasterPageTitle
        title="Painel master"
        subtitle="Visão geral da plataforma · filtre receitas e renovações por calendário"
      />

      {summaryQuery.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar o painel master.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {topCardsLoading
              ? Array.from({ length: 6 }).map((_, i) => <AdminKpiCardSkeleton key={`master-kpi-${i}`} />)
              : stats.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={s.disabled}
                    onClick={() => !s.disabled && applyKpiFilter(s.id)}
                    className={cn(
                      "rounded-2xl border bg-card p-6 text-left shadow-soft transition hover:border-primary/40 hover:shadow-md",
                      calendar.activeKpi === s.id && "border-primary ring-2 ring-primary/20",
                      s.disabled && "cursor-default opacity-80 hover:border-border hover:shadow-soft",
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <s.icon className="size-4" /> {s.label}
                    </div>
                    <div className="mt-3 font-display text-3xl">{s.value}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{s.sub}</p>
                  </button>
                ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
            <IntelligentCalendarPicker
              selected={calendar.calendarSelected}
              onSelectDay={calendar.handleDayClick}
              onMonthChange={calendar.setCalendarMonth}
              activityByDate={activityByDate}
              hint="Filtre pagamentos recebidos (passado) e renovações projetadas (futuro). Navegue meses à frente para simular receita."
            />

            <DashboardRangeReport
              queryStart={calendar.queryStart}
              queryEnd={calendar.queryEnd}
              isSingleDay={calendar.isSingleDay}
              isRange={calendar.isRange}
              isLoading={rangeQuery.isLoading}
              isError={rangeQuery.isError}
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
          </div>
        </>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Acesso rápido</div>
            <p className="mt-1 text-xs text-muted-foreground">Atalhos do painel master.</p>
          </div>
          {hasCompanyPanel && (
            <Link to="/admin" className="text-xs font-medium text-gold hover:underline">
              Ir ao painel da empresa →
            </Link>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link to="/master/empresas" className="font-medium text-gold hover:underline">
            Gerenciar empresas →
          </Link>
          <Link to="/master/inadimplentes" className="font-medium text-gold hover:underline">
            Inadimplentes →
          </Link>
          <span className="text-muted-foreground">
            {summary?.open_tickets ?? 0}{" "}
            {(summary?.open_tickets ?? 0) === 1 ? "chamado em aberto" : "chamados em aberto"}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Cupons de desconto ativos</div>
            <p className="mt-1 text-xs text-muted-foreground">Códigos válidos agora.</p>
          </div>
          <Link to="/master/cupons" className="text-xs font-medium text-gold hover:underline">
            Gerenciar cupons →
          </Link>
        </div>
        <div className="mt-4">
          {couponsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full max-w-md rounded-xl" />
              <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
            </div>
          ) : activeCoupons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cupom ativo no momento.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {activeCoupons.slice(0, 8).map((c: { id: string; code: string; discount_type?: string; discount_value?: unknown; expires_at?: string | null }) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <span className="font-mono font-medium">{c.code}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {couponDiscountLabel(c.discount_type, c.discount_value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="text-sm font-medium text-foreground">MRR por plano</div>
          <div className="mt-4 space-y-3">
            {subsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : Object.keys(mrrByPlan).length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem assinaturas ativas com plano vinculado.</div>
            ) : (
              Object.entries(mrrByPlan)
                .sort((a, b) => b[1].mrr - a[1].mrr)
                .map(([key, v]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.count} assinatura(s)</div>
                    </div>
                    <div className="shrink-0 text-sm font-medium">{formatBrl(v.mrr)}</div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="text-sm font-medium text-foreground">Risco</div>
          <div className="mt-3 text-sm text-muted-foreground">
            {(summary?.past_due_subscriptions ?? 0) > 0
              ? `${summary?.past_due_subscriptions} assinatura(s) em atraso.`
              : "Nenhuma assinatura em atraso no momento."}
          </div>
          <Link to="/master/inadimplentes" className="mt-4 inline-flex text-sm font-medium text-gold hover:underline">
            Ver inadimplentes →
          </Link>
        </div>
      </div>
    </div>
  );
}
