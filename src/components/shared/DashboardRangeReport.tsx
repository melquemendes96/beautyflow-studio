import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  dayHasActivity,
  formatRangeLabel,
  parseYmd,
  type DashboardRangeData,
  type DashboardRangeDay,
} from "@/lib/intelligent-calendar-range";
import { CheckCircle2, Clock } from "lucide-react";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function secondaryMetric(
  block: { revenue: number; commission: number },
  primaryField: "revenue" | "commission",
) {
  return primaryField === "revenue" ? block.commission : block.revenue;
}

function MetricBlock({
  title,
  icon: Icon,
  tone,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  countLabel,
  countValue,
  hint,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "gold" | "info";
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  countLabel: string;
  countValue: string | number;
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
          <div className="text-xs text-muted-foreground">{primaryLabel}</div>
          <div className="font-display text-2xl text-gold">{primaryValue}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{secondaryLabel}</div>
          <div className="font-display text-xl">{secondaryValue}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{countLabel}</div>
          <div className="text-lg font-medium">{countValue}</div>
        </div>
      </div>
    </div>
  );
}

function DayBreakdown({
  days,
  primaryField,
}: {
  days: DashboardRangeDay[];
  primaryField: "revenue" | "commission";
}) {
  const activeDays = days.filter(dayHasActivity);
  if (activeDays.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhuma movimentação neste período.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {activeDays.map((day) => {
        const isFuture = day.is_future;
        const isPast = day.is_past;
        const primary =
          primaryField === "revenue"
            ? isFuture
              ? day.upcoming_revenue
              : isPast
                ? day.realized_revenue
                : day.realized_revenue + day.upcoming_revenue
            : isFuture
              ? day.upcoming_commission
              : isPast
                ? day.realized_commission
                : day.realized_commission + day.upcoming_commission;
        const count = isFuture
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
              <div className="text-xs text-muted-foreground">{count} registro(s)</div>
            </div>
            <div className="text-right">
              <div className="font-display text-lg text-gold">{formatMoney(primary)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type DashboardRangeLabels = {
  realizedTitle: string;
  realizedHint?: string;
  todayRealizedTitle: string;
  todayPendingTitle: string;
  upcomingTitle: string;
  upcomingHint?: string;
  primaryLabel: string;
  secondaryLabel: string;
  countLabel: string;
  singleFutureTitle: string;
};

const defaultLabels: DashboardRangeLabels = {
  realizedTitle: "Já realizado",
  todayRealizedTitle: "Hoje — realizado",
  todayPendingTitle: "Hoje — pendente",
  upcomingTitle: "Projetado (futuro)",
  primaryLabel: "Valor principal",
  secondaryLabel: "Valor secundário",
  countLabel: "Quantidade",
  singleFutureTitle: "Projetado",
};

export function DashboardRangeReport({
  queryStart,
  queryEnd,
  isSingleDay,
  isRange,
  isLoading,
  isError,
  data,
  labels: labelOverrides,
  primaryField = "revenue",
}: {
  queryStart: string;
  queryEnd: string;
  isSingleDay: boolean;
  isRange: boolean;
  isLoading: boolean;
  isError: boolean;
  data?: DashboardRangeData | null;
  labels?: Partial<DashboardRangeLabels>;
  primaryField?: "revenue" | "commission";
}) {
  const labels = { ...defaultLabels, ...labelOverrides };
  const showPastBlock = isRange && ((data?.realized?.appointments ?? 0) > 0 || (data?.realized?.revenue ?? 0) > 0);
  const showTodayBlock =
    data &&
    queryStart <= (data.today ?? "") &&
    queryEnd >= (data.today ?? "") &&
    ((data.today_block?.realized_appointments ?? 0) > 0 ||
      (data.today_block?.upcoming_appointments ?? 0) > 0 ||
      (data.today_block?.realized_revenue ?? 0) > 0 ||
      (data.today_block?.upcoming_revenue ?? 0) > 0);
  const showFutureBlock =
    isRange && ((data?.upcoming?.appointments ?? 0) > 0 || (data?.upcoming?.revenue ?? 0) > 0);

  const primary = (block: { revenue: number; commission: number }) =>
    primaryField === "revenue" ? block.revenue : block.commission;

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-display text-xl">{formatRangeLabel(queryStart, queryEnd)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {isSingleDay
            ? "Detalhe do dia selecionado"
            : "Intervalo com relatórios separados: passado · hoje · futuro"}
        </p>

        {isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <p className="mt-4 text-sm text-destructive">Não foi possível carregar este período.</p>
        ) : isSingleDay && data?.days?.[0] ? (
          <div className="mt-4">
            {(() => {
              const day = data.days![0];
              if (day.is_future) {
                return (
                  <MetricBlock
                    title={labels.singleFutureTitle}
                    icon={Clock}
                    tone="info"
                    primaryLabel={labels.primaryLabel}
                    primaryValue={formatMoney(primaryField === "revenue" ? day.upcoming_revenue : day.upcoming_commission)}
                    secondaryLabel={labels.secondaryLabel}
                    secondaryValue={formatMoney(secondaryMetric({ revenue: day.upcoming_revenue, commission: day.upcoming_commission }, primaryField))}
                    countLabel={labels.countLabel}
                    countValue={day.upcoming_appointments}
                    hint={labels.upcomingHint}
                  />
                );
              }
              if (day.is_today) {
                return (
                  <div className="space-y-4">
                    {(day.realized_appointments > 0 || day.upcoming_appointments === 0) && (
                      <MetricBlock
                        title={labels.todayRealizedTitle}
                        icon={CheckCircle2}
                        tone="success"
                        primaryLabel={labels.primaryLabel}
                        primaryValue={formatMoney(primaryField === "revenue" ? day.realized_revenue : day.realized_commission)}
                        secondaryLabel={labels.secondaryLabel}
                        secondaryValue={formatMoney(
                          secondaryMetric(
                            { revenue: day.realized_revenue, commission: day.realized_commission },
                            primaryField,
                          ),
                        )}
                        countLabel={labels.countLabel}
                        countValue={day.realized_appointments}
                      />
                    )}
                    {day.upcoming_appointments > 0 && (
                      <MetricBlock
                        title={labels.todayPendingTitle}
                        icon={Clock}
                        tone="info"
                        primaryLabel={labels.primaryLabel}
                        primaryValue={formatMoney(primaryField === "revenue" ? day.upcoming_revenue : day.upcoming_commission)}
                        secondaryLabel={labels.secondaryLabel}
                        secondaryValue={formatMoney(secondaryMetric({ revenue: day.upcoming_revenue, commission: day.upcoming_commission }, primaryField))}
                        countLabel={labels.countLabel}
                        countValue={day.upcoming_appointments}
                      />
                    )}
                  </div>
                );
              }
              return (
                <MetricBlock
                  title={labels.realizedTitle}
                  icon={CheckCircle2}
                  tone="success"
                  primaryLabel={labels.primaryLabel}
                  primaryValue={formatMoney(primaryField === "revenue" ? day.realized_revenue : day.realized_commission)}
                  secondaryLabel={labels.secondaryLabel}
                  secondaryValue={formatMoney(
                    secondaryMetric(
                      { revenue: day.realized_revenue, commission: day.realized_commission },
                      primaryField,
                    ),
                  )}
                  countLabel={labels.countLabel}
                  countValue={day.realized_appointments}
                />
              );
            })()}
          </div>
        ) : data ? (
          <div className="mt-4 space-y-4">
            {showPastBlock && data.realized ? (
              <MetricBlock
                title={labels.realizedTitle}
                icon={CheckCircle2}
                tone="success"
                primaryLabel={labels.primaryLabel}
                primaryValue={formatMoney(primary(data.realized))}
                secondaryLabel={labels.secondaryLabel}
                secondaryValue={formatMoney(secondaryMetric(data.realized, primaryField))}
                countLabel={labels.countLabel}
                countValue={data.realized.appointments}
                hint={labels.realizedHint}
              />
            ) : null}

            {showTodayBlock && data.today_block ? (
              <div className="space-y-3">
                {(data.today_block.realized_appointments > 0 ||
                  data.today_block.upcoming_appointments === 0 ||
                  data.today_block.realized_revenue > 0) && (
                  <MetricBlock
                    title={labels.todayRealizedTitle}
                    icon={CheckCircle2}
                    tone="gold"
                    primaryLabel={labels.primaryLabel}
                    primaryValue={formatMoney(
                      primaryField === "revenue"
                        ? data.today_block.realized_revenue
                        : data.today_block.realized_commission,
                    )}
                    secondaryLabel={labels.secondaryLabel}
                    secondaryValue={formatMoney(
                      secondaryMetric(
                        {
                          revenue: data.today_block.realized_revenue,
                          commission: data.today_block.realized_commission,
                        },
                        primaryField,
                      ),
                    )}
                    countLabel={labels.countLabel}
                    countValue={data.today_block.realized_appointments}
                  />
                )}
                {(data.today_block.upcoming_appointments > 0 || data.today_block.upcoming_revenue > 0) && (
                  <MetricBlock
                    title={labels.todayPendingTitle}
                    icon={Clock}
                    tone="info"
                    primaryLabel={labels.primaryLabel}
                    primaryValue={formatMoney(
                      primaryField === "revenue"
                        ? data.today_block.upcoming_revenue
                        : data.today_block.upcoming_commission,
                    )}
                    secondaryLabel={labels.secondaryLabel}
                    secondaryValue={formatMoney(
                      secondaryMetric(
                        {
                          revenue: data.today_block.upcoming_revenue,
                          commission: data.today_block.upcoming_commission,
                        },
                        primaryField,
                      ),
                    )}
                    countLabel={labels.countLabel}
                    countValue={data.today_block.upcoming_appointments}
                  />
                )}
              </div>
            ) : null}

            {showFutureBlock && data.upcoming ? (
              <MetricBlock
                title={labels.upcomingTitle}
                icon={Clock}
                tone="info"
                primaryLabel={labels.primaryLabel}
                primaryValue={formatMoney(primary(data.upcoming))}
                secondaryLabel={labels.secondaryLabel}
                secondaryValue={formatMoney(secondaryMetric(data.upcoming, primaryField))}
                countLabel={labels.countLabel}
                countValue={data.upcoming.appointments}
                hint={labels.upcomingHint}
              />
            ) : null}

            {!showPastBlock && !showTodayBlock && !showFutureBlock ? (
              <p className="text-sm text-muted-foreground">Nenhuma movimentação neste intervalo.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {data?.days && data.days.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-display text-lg">Detalhe por dia</h3>
          <div className="mt-4">
            <DayBreakdown days={data.days} primaryField={primaryField} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
