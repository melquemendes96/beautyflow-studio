import { Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { Calendar as CalendarPicker, CalendarDayButton } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentCompany } from "@/lib/current-company";
import { cn } from "@/lib/utils";
import {
  formatProviderMoney,
  providerService,
  type ProviderCommissionDay,
  type ProviderCommissionRange,
} from "@/services/providerService";
import { payoutService } from "@/services/payoutService";
import { useQuery } from "@tanstack/react-query";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Package,
  Percent,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(ymd: string) {
  return new Date(`${ymd}T12:00:00`);
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

type KpiFilter = "today" | "commission_today" | "week" | "month" | "products" | null;

function normalizeRange(start: string, end: string) {
  return start <= end ? { start, end } : { start: end, end: start };
}

function formatRangeLabel(start: string, end: string) {
  if (start === end) {
    return parseYmd(start).toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  return `${parseYmd(start).toLocaleDateString("pt-BR")} – ${parseYmd(end).toLocaleDateString("pt-BR")}`;
}

function dayHasActivity(day: ProviderCommissionDay) {
  return day.realized_appointments > 0 || day.upcoming_appointments > 0;
}

function CommissionBlock({
  title,
  icon: Icon,
  tone,
  revenue,
  commission,
  appointments,
  productSales,
  productCommission,
  hint,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "gold" | "info";
  revenue: number;
  commission: number;
  appointments: number;
  productSales?: number;
  productCommission?: number;
  hint?: string;
}) {
  const toneClass = {
    success: "border-success/30 bg-success/5",
    gold: "border-gold/30 bg-gold/5",
    info: "border-info/30 bg-info/5",
  }[tone];

  const iconClass = {
    success: "text-success",
    gold: "text-gold",
    info: "text-info",
  }[tone];

  return (
    <div className={cn("rounded-2xl border p-5 shadow-soft", toneClass)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4", iconClass)} />
        <h3 className="font-display text-lg">{title}</h3>
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">Comissão</div>
          <div className="font-display text-2xl text-gold">{formatProviderMoney(commission)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Base faturamento</div>
          <div className="font-display text-xl">{formatProviderMoney(revenue)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Atendimentos</div>
          <div className="text-lg font-medium">{appointments}</div>
        </div>
        {(productSales !== undefined || productCommission !== undefined) && (
          <div>
            <div className="text-xs text-muted-foreground">Produtos</div>
            <div className="text-sm">
              {formatProviderMoney(productSales ?? 0)} · comissão {formatProviderMoney(productCommission ?? 0)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DayBreakdown({ days }: { days: ProviderCommissionDay[] }) {
  const activeDays = days.filter(dayHasActivity);
  if (activeDays.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum atendimento neste período.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {activeDays.map((day) => {
        const isPast = day.is_past;
        const isFuture = day.is_future;
        const commission = isFuture
          ? day.upcoming_commission
          : isPast
            ? day.realized_commission
            : day.realized_commission + day.upcoming_commission;
        const appts = isFuture
          ? day.upcoming_appointments
          : isPast
            ? day.realized_appointments
            : day.realized_appointments + day.upcoming_appointments;

        return (
          <div key={day.date} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">
                {parseYmd(day.date).toLocaleDateString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                })}
                {day.is_today ? (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium">Hoje</span>
                ) : null}
                {isFuture ? (
                  <span className="ml-2 rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-medium text-info">
                    Projetado
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {appts} atendimento(s)
                {day.is_today && day.upcoming_appointments > 0
                  ? ` · ${day.realized_appointments} concluído(s), ${day.upcoming_appointments} pendente(s)`
                  : null}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-lg text-gold">{formatProviderMoney(commission)}</div>
              {!isFuture ? (
                <div className="text-xs text-muted-foreground">
                  {formatProviderMoney(day.realized_revenue)} faturados
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  ~{formatProviderMoney(day.upcoming_revenue)} projetados
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProviderCommissionDashboard() {
  const { companyId, hasCompany, providerId } = useCurrentCompany();
  const todayYmd = useMemo(() => toYmd(new Date()), []);
  const [rangeStart, setRangeStart] = useState(todayYmd);
  const [rangeEnd, setRangeEnd] = useState(todayYmd);
  const [activeKpi, setActiveKpi] = useState<KpiFilter>("today");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const activeKpiRef = useRef<KpiFilter>("today");
  activeKpiRef.current = activeKpi;

  const { start: queryStart, end: queryEnd } = useMemo(
    () => normalizeRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  const isSingleDay = queryStart === queryEnd;
  const isRange = !isSingleDay;

  const dashboardQuery = useQuery({
    queryKey: ["admin", "provider", "commission", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await providerService.getCommissionDashboard(companyId!);
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) {
        throw new Error(data.error ?? "Não foi possível carregar seu dashboard.");
      }
      return data;
    },
    staleTime: 30_000,
  });

  const monthStartYmd = useMemo(() => toYmd(startOfMonth(new Date())), []);
  const monthEndYmd = useMemo(() => toYmd(endOfMonth(new Date())), []);

  const productMonthQuery = useQuery({
    queryKey: ["admin", "provider", "product-commission", companyId, providerId, monthStartYmd, monthEndYmd],
    enabled: hasCompany && Boolean(companyId) && Boolean(providerId),
    queryFn: async () => {
      const res = await payoutService.getBalance(companyId!, providerId!, monthStartYmd, monthEndYmd);
      if (!res.ok) return null;
      return res;
    },
    staleTime: 30_000,
  });

  const rangeQuery = useQuery({
    queryKey: ["admin", "provider", "commission-range", companyId, queryStart, queryEnd],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await providerService.getCommissionRange(companyId!, queryStart, queryEnd);
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) {
        throw new Error(data.error ?? "Não foi possível carregar o período.");
      }
      return data as ProviderCommissionRange;
    },
    staleTime: 15_000,
  });

  const monthStartYmdCal = toYmd(startOfMonth(calendarMonth));
  const monthEndYmdCal = toYmd(endOfMonth(calendarMonth));

  const monthActivityQuery = useQuery({
    queryKey: ["admin", "provider", "commission-month", companyId, monthStartYmdCal, monthEndYmdCal],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await providerService.getCommissionRange(companyId!, monthStartYmdCal, monthEndYmdCal);
      if (res.error) throw res.error;
      return res.data as ProviderCommissionRange | null;
    },
    staleTime: 60_000,
  });

  const summary = dashboardQuery.data?.summary;
  const pct = dashboardQuery.data?.commission_pct ?? rangeQuery.data?.commission_pct ?? 0;
  const rangeData = rangeQuery.data;

  const activityByDate = useMemo(() => {
    const map = new Map<string, ProviderCommissionDay>();
    for (const day of monthActivityQuery.data?.days ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [monthActivityQuery.data?.days]);

  const applyKpiFilter = useCallback((filter: KpiFilter) => {
    const now = new Date();
    setActiveKpi(filter);
    if (filter === "today" || filter === "commission_today") {
      const t = toYmd(now);
      setRangeStart(t);
      setRangeEnd(t);
      setCalendarMonth(now);
      return;
    }
    if (filter === "week") {
      setRangeStart(toYmd(startOfWeekMonday(now)));
      setRangeEnd(toYmd(endOfWeekSunday(now)));
      setCalendarMonth(now);
      return;
    }
    if (filter === "month" || filter === "products") {
      setRangeStart(toYmd(startOfMonth(now)));
      setRangeEnd(toYmd(endOfMonth(now)));
      setCalendarMonth(now);
    }
  }, []);

  const handleDayClick = useCallback(
    (day: Date) => {
      const ymd = toYmd(day);
      const kpiWasActive = activeKpiRef.current !== null;
      setActiveKpi(null);

      const { start, end } = normalizeRange(rangeStart, rangeEnd);
      const isSingle = start === end;

      if (isSingle && start === ymd) {
        return;
      }

      if (isSingle && start !== ymd) {
        if (kpiWasActive) {
          setRangeStart(ymd);
          setRangeEnd(ymd);
          return;
        }
        setRangeEnd(ymd);
        return;
      }

      setRangeStart(ymd);
      setRangeEnd(ymd);
    },
    [rangeEnd, rangeStart],
  );

  const calendarSelected = useMemo(() => {
    const { start, end } = normalizeRange(rangeStart, rangeEnd);
    return { from: parseYmd(start), to: parseYmd(end) };
  }, [rangeStart, rangeEnd]);

  const showPastBlock = isRange && (rangeData?.realized?.appointments ?? 0) > 0;
  const showTodayBlock =
    rangeData &&
    queryStart <= (rangeData.today ?? todayYmd) &&
    queryEnd >= (rangeData.today ?? todayYmd) &&
    ((rangeData.today_block?.realized_appointments ?? 0) > 0 ||
      (rangeData.today_block?.upcoming_appointments ?? 0) > 0);
  const showFutureBlock = isRange && (rangeData?.upcoming?.appointments ?? 0) > 0;

  const stats = [
    {
      id: "today" as const,
      icon: Wallet,
      label: "Faturamento hoje",
      value: summary ? formatProviderMoney(summary.today_revenue) : "—",
      sub: summary ? `${summary.today_appointments} atendimento(s)` : "",
      color: "text-success",
    },
    {
      id: "commission_today" as const,
      icon: Percent,
      label: "Comissão hoje",
      value: summary ? formatProviderMoney(summary.today_commission) : "—",
      sub: `${pct}% sobre serviços`,
      color: "text-gold",
    },
    {
      id: "week" as const,
      icon: TrendingUp,
      label: "Comissão na semana",
      value: summary ? formatProviderMoney(summary.week_commission) : "—",
      sub: summary ? `${formatProviderMoney(summary.week_revenue)} faturados` : "",
      color: "text-info",
    },
    {
      id: "month" as const,
      icon: Calendar,
      label: "Comissão no mês",
      value: summary ? formatProviderMoney(summary.month_commission) : "—",
      sub: summary ? `${formatProviderMoney(summary.month_revenue)} faturados` : "",
      color: "text-purple-soft",
    },
    {
      id: "products" as const,
      icon: Package,
      label: "Comissão produtos (mês)",
      value: productMonthQuery.data
        ? formatProviderMoney(productMonthQuery.data.product_commission)
        : "—",
      sub: "Comissão sobre produtos vendidos na comanda",
      color: "text-purple-soft",
      disabled: false,
    },
  ];

  return (
    <div>
      <PageTitle
        title="Meu desempenho"
        subtitle={
          dashboardQuery.data?.display_name
            ? `${dashboardQuery.data.display_name} · comissão de ${pct}% · selecione datas no calendário`
            : "Faturamento, comissão realizada e projeção futura"
        }
        action={
          <Link
            to="/admin/agenda"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
          >
            <Calendar className="size-4" />
            Minha agenda
          </Link>
        }
      />

      {dashboardQuery.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar seus números. Tente atualizar a página.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {dashboardQuery.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <AdminKpiCardSkeleton key={`prov-kpi-${i}`} />)
              : stats.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={s.disabled}
                    onClick={() => !s.disabled && applyKpiFilter(s.id)}
                    className={cn(
                      "rounded-2xl border bg-card p-5 text-left shadow-soft transition hover:border-primary/40 hover:shadow-md",
                      activeKpi === s.id && "border-primary ring-2 ring-primary/20",
                      s.disabled && "cursor-default opacity-70 hover:border-border hover:shadow-soft",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <s.icon className={cn("size-4", s.color)} />
                    </div>
                    <div className="mt-3 font-display text-2xl xl:text-3xl">{s.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
                  </button>
                ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
            <div className="w-fit rounded-2xl border border-border bg-card p-2 shadow-soft">
              <CalendarPicker
                mode="range"
                selected={calendarSelected}
                onSelect={(_range, day) => day && handleDayClick(day)}
                onMonthChange={setCalendarMonth}
                locale={ptBR}
                className="rounded-xl"
                components={{
                  DayButton: (props) => {
                    const ymd = toYmd(props.day.date);
                    const info = activityByDate.get(ymd);
                    const hasRealized = (info?.realized_appointments ?? 0) > 0;
                    const hasUpcoming = (info?.upcoming_appointments ?? 0) > 0;
                    return (
                      <CalendarDayButton {...props} className={cn(props.className, "flex-col gap-0.5 leading-none")}>
                        <span>{props.day.date.getDate()}</span>
                        {(hasRealized || hasUpcoming) && (
                          <span className="flex gap-0.5">
                            {hasRealized ? <span className="size-1 rounded-full bg-success" /> : null}
                            {hasUpcoming ? <span className="size-1 rounded-full bg-info" /> : null}
                          </span>
                        )}
                      </CalendarDayButton>
                    );
                  },
                }}
              />
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">
                Clique um dia para ver a comissão. Clique outro dia para intervalo inteligente (passado · hoje ·
                futuro). Navegue meses à frente para testar projeções.
              </p>
              <div className="flex flex-wrap gap-3 px-3 pb-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-success" /> Realizado
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-info" /> Projetado
                </span>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <h2 className="font-display text-xl">{formatRangeLabel(queryStart, queryEnd)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isSingleDay
                    ? "Detalhe do dia selecionado"
                    : "Intervalo com relatórios separados: já recebi · hoje · a receber"}
                </p>

                {rangeQuery.isLoading ? (
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : rangeQuery.isError ? (
                  <p className="mt-4 text-sm text-destructive">Não foi possível carregar este período.</p>
                ) : isSingleDay && rangeData ? (
                  <div className="mt-4">
                    {(() => {
                      const day = rangeData.days?.[0];
                      if (!day) return null;
                      if (day.is_future) {
                        return (
                          <CommissionBlock
                            title="A receber (projetado)"
                            icon={Clock}
                            tone="info"
                            revenue={day.upcoming_revenue}
                            commission={day.upcoming_commission}
                            appointments={day.upcoming_appointments}
                            hint="Estimativa com base nos agendamentos confirmados"
                          />
                        );
                      }
                      if (day.is_today) {
                        return (
                          <div className="space-y-4">
                            {(day.realized_appointments > 0 || day.upcoming_appointments === 0) && (
                              <CommissionBlock
                                title="Hoje — já realizado"
                                icon={CheckCircle2}
                                tone="success"
                                revenue={day.realized_revenue}
                                commission={day.realized_commission}
                                appointments={day.realized_appointments}
                              />
                            )}
                            {day.upcoming_appointments > 0 && (
                              <CommissionBlock
                                title="Hoje — ainda pendente"
                                icon={Clock}
                                tone="info"
                                revenue={day.upcoming_revenue}
                                commission={day.upcoming_commission}
                                appointments={day.upcoming_appointments}
                                hint="Projeção dos atendimentos restantes de hoje"
                              />
                            )}
                          </div>
                        );
                      }
                      return (
                        <CommissionBlock
                          title="Já recebi"
                          icon={CheckCircle2}
                          tone="success"
                          revenue={day.realized_revenue}
                          commission={day.realized_commission}
                          appointments={day.realized_appointments}
                        />
                      );
                    })()}
                  </div>
                ) : rangeData ? (
                  <div className="mt-4 space-y-4">
                    {showPastBlock && rangeData.realized ? (
                      <CommissionBlock
                        title="Já recebi"
                        icon={CheckCircle2}
                        tone="success"
                        revenue={rangeData.realized.revenue}
                        commission={rangeData.realized.commission}
                        appointments={rangeData.realized.appointments}
                        productSales={rangeData.realized.product_sales}
                        productCommission={rangeData.realized.product_commission}
                        hint="Atendimentos concluídos antes de hoje no intervalo"
                      />
                    ) : null}

                    {showTodayBlock && rangeData.today_block ? (
                      <div className="space-y-3">
                        {(rangeData.today_block.realized_appointments > 0 ||
                          rangeData.today_block.upcoming_appointments === 0) && (
                          <CommissionBlock
                            title="Hoje — realizado"
                            icon={CheckCircle2}
                            tone="gold"
                            revenue={rangeData.today_block.realized_revenue}
                            commission={rangeData.today_block.realized_commission}
                            appointments={rangeData.today_block.realized_appointments}
                          />
                        )}
                        {rangeData.today_block.upcoming_appointments > 0 && (
                          <CommissionBlock
                            title="Hoje — pendente"
                            icon={Clock}
                            tone="info"
                            revenue={rangeData.today_block.upcoming_revenue}
                            commission={rangeData.today_block.upcoming_commission}
                            appointments={rangeData.today_block.upcoming_appointments}
                          />
                        )}
                      </div>
                    ) : null}

                    {showFutureBlock && rangeData.upcoming ? (
                      <CommissionBlock
                        title="A receber (futuro)"
                        icon={Clock}
                        tone="info"
                        revenue={rangeData.upcoming.revenue}
                        commission={rangeData.upcoming.commission}
                        appointments={rangeData.upcoming.appointments}
                        productSales={rangeData.upcoming.product_sales}
                        productCommission={rangeData.upcoming.product_commission}
                        hint="Projeção dos agendamentos após hoje no intervalo"
                      />
                    ) : null}

                    {!showPastBlock && !showTodayBlock && !showFutureBlock ? (
                      <p className="text-sm text-muted-foreground">Nenhum atendimento neste intervalo.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {rangeData?.days && rangeData.days.length > 0 ? (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <h3 className="font-display text-lg">Detalhe por dia</h3>
                  <div className="mt-4">
                    <DayBreakdown days={rangeData.days} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
