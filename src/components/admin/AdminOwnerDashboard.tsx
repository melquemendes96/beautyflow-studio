import { Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { AdminAgendaRowSkeleton, AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { DashboardRangeReport } from "@/components/shared/DashboardRangeReport";
import { IntelligentCalendarPicker } from "@/components/shared/IntelligentCalendarPicker";
import { Button } from "@/components/ui/button";
import { compareAppointmentTime, formatAppointmentTimeHm } from "@/lib/appointment-time";
import { useCurrentCompany } from "@/lib/current-company";
import { endOfMonth, startOfMonth, toYmd, useIntelligentCalendarRange, type DashboardRangeDay } from "@/lib/intelligent-calendar-range";
import { cn } from "@/lib/utils";
import { appointmentService } from "@/services/appointmentService";
import { companyDashboardService, formatCompanyMoney } from "@/services/companyDashboardService";
import { companyService } from "@/services/companyService";
import { onboardingService } from "@/services/onboardingService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calendar, CheckCircle2, Percent, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const statusClass: Record<string, string> = {
  scheduled: "bg-info/15 text-info",
  confirmed: "bg-purple-soft/15 text-purple-soft",
  completed: "bg-success/15 text-success",
  cancelled: "bg-warning/20 text-warning",
  no_show: "bg-destructive/15 text-destructive",
};

type AdminKpiFilter = "today" | "clients" | "week" | "month" | "commissions" | null;

export function AdminOwnerDashboard() {
  const { companyId, hasCompany } = useCurrentCompany();
  const queryClient = useQueryClient();
  const calendar = useIntelligentCalendarRange("today");

  const companyQuery = useQuery({
    queryKey: ["admin", "company", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyService.getByIdForAdmin(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["admin", "company", "dashboard", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyDashboardService.getSummary(companyId!);
      if (res.error) throw res.error;
      const data = res.data;
      if (data?.ok === false) throw new Error(data.error ?? "Erro ao carregar dashboard.");
      return data;
    },
    staleTime: 30_000,
  });

  const rangeQuery = useQuery({
    queryKey: ["admin", "company", "dashboard-range", companyId, calendar.queryStart, calendar.queryEnd],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyDashboardService.getRange(companyId!, calendar.queryStart, calendar.queryEnd);
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
    queryKey: ["admin", "company", "dashboard-month", companyId, monthStartYmd, monthEndYmd],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyDashboardService.getRange(companyId!, monthStartYmd, monthEndYmd);
      if (res.error) throw res.error;
      return res.data;
    },
    staleTime: 60_000,
  });

  const todayYmd = calendar.todayYmd;
  const todayAppointmentsQuery = useQuery({
    queryKey: ["admin", "agenda", "day", companyId, todayYmd],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await appointmentService.listByCompanyAndDate(companyId!, todayYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const res = await onboardingService.markOnboardingComplete();
      if (res.error) throw res.error;
      const data = res.data as { ok?: boolean; error?: string };
      if (data?.ok === false) {
        if (data.error === "cadastre_um_servico") {
          throw new Error("Cadastre pelo menos um serviço ativo antes de concluir.");
        }
        throw new Error("Não foi possível concluir o onboarding.");
      }
      return data;
    },
    onSuccess: async () => {
      toast.success("Configuração inicial concluída. Bem-vinda ao painel completo!");
      await queryClient.invalidateQueries({ queryKey: ["admin", "company", companyId] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Tente novamente.";
      toast.error(msg);
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

  const applyKpiFilter = (filter: AdminKpiFilter) => {
    if (!filter || filter === "clients") return;
    calendar.setActiveKpi(filter);
    if (filter === "today" || filter === "commissions") {
      calendar.applyPreset("today");
      return;
    }
    if (filter === "week") {
      calendar.applyPreset("week");
      return;
    }
    if (filter === "month") {
      calendar.applyPreset("month");
    }
  };

  const stats = [
    {
      id: "today" as const,
      icon: Calendar,
      label: "Atendimentos hoje",
      value: summary ? String(summary.today_appointments) : "—",
      sub: "Clique para filtrar o dia",
      color: "text-info",
      disabled: false,
    },
    {
      id: "clients" as const,
      icon: Users,
      label: "Clientes cadastrados",
      value: summaryQuery.data?.clients_count != null ? String(summaryQuery.data.clients_count) : "—",
      sub: "Total da base",
      color: "text-purple-soft",
      disabled: true,
    },
    {
      id: "week" as const,
      icon: Wallet,
      label: "Faturamento na semana",
      value: summary ? formatCompanyMoney(summary.week_revenue) : "—",
      sub: summary ? `${summary.week_appointments} atendimento(s)` : "",
      color: "text-success",
      disabled: false,
    },
    {
      id: "month" as const,
      icon: TrendingUp,
      label: "Faturamento no mês",
      value: summary ? formatCompanyMoney(summary.month_revenue) : "—",
      sub: summary ? `${summary.month_appointments} atendimento(s)` : "",
      color: "text-gold",
      disabled: false,
    },
    {
      id: "commissions" as const,
      icon: Percent,
      label: "Comissões hoje",
      value: summary ? formatCompanyMoney(summary.today_commissions) : "—",
      sub: summary ? `${formatCompanyMoney(summary.today_revenue)} faturados hoje` : "",
      color: "text-info",
      disabled: false,
    },
  ];

  const agendaHoje = useMemo(() => {
    const list = (todayAppointmentsQuery.data ?? [])
      .slice()
      .sort((a: { appointment_time: string }, b: { appointment_time: string }) =>
        compareAppointmentTime(a.appointment_time, b.appointment_time),
      );
    return list.slice(0, 5);
  }, [todayAppointmentsQuery.data]);

  const showOnboardingCard =
    hasCompany && companyQuery.data && companyQuery.data.onboarding_completed === false;

  return (
    <div>
      <PageTitle
        title="Dashboard"
        subtitle="Visão geral do studio · selecione datas no calendário para filtrar faturamento e comissões"
      />

      {showOnboardingCard && (
        <div className="mb-6 rounded-2xl border border-gold/35 bg-gradient-to-br from-gold-soft/30 to-card p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-gold">
                <CheckCircle2 className="size-5" />
                <h2 className="font-display text-xl">Configure seu studio em poucos passos</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Complete a identidade visual, horários e serviços. Depois finalize para liberar o painel completo.
              </p>
              <ol className="mt-4 flex flex-wrap gap-3 text-sm">
                <li>
                  <Link to="/admin/branding" className="font-medium text-foreground underline-offset-4 hover:underline">
                    1. Aparência da marca
                  </Link>
                </li>
                <li>
                  <Link to="/admin/configuracoes" className="font-medium text-foreground underline-offset-4 hover:underline">
                    2. Agenda e horários
                  </Link>
                </li>
                <li>
                  <Link to="/admin/servicos" className="font-medium text-foreground underline-offset-4 hover:underline">
                    3. Serviços
                  </Link>
                </li>
              </ol>
            </div>
            <Button
              type="button"
              className="rounded-full bg-foreground text-background hover:opacity-90"
              disabled={completeOnboardingMutation.isPending}
              onClick={() => completeOnboardingMutation.mutate()}
            >
              {completeOnboardingMutation.isPending ? "Salvando…" : "Concluir configuração inicial"}
            </Button>
          </div>
        </div>
      )}

      {summaryQuery.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar os indicadores. Tente atualizar a página.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryQuery.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <AdminKpiCardSkeleton key={`kpi-sk-${i}`} />)
              : stats.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={s.disabled}
                    onClick={() => !s.disabled && applyKpiFilter(s.id)}
                    className={cn(
                      "rounded-2xl border bg-card p-5 text-left shadow-soft transition hover:border-primary/40 hover:shadow-md",
                      calendar.activeKpi === s.id && "border-primary ring-2 ring-primary/20",
                      s.disabled && "cursor-default opacity-80 hover:border-border hover:shadow-soft",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <s.icon className={cn("size-4", s.color)} />
                    </div>
                    <div className="mt-3 font-display text-2xl xl:text-3xl">{s.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
                    {s.id === "month" && summary ? (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        Comparecimento 30d: {summary.attendance_rate_30d}%
                      </div>
                    ) : null}
                  </button>
                ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
            <IntelligentCalendarPicker
              selected={calendar.calendarSelected}
              onSelectDay={calendar.handleDayClick}
              onMonthChange={calendar.setCalendarMonth}
              activityByDate={activityByDate}
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
                realizedTitle: "Já faturado",
                realizedHint: "Atendimentos concluídos antes de hoje no intervalo",
                todayRealizedTitle: "Hoje — já faturado",
                todayPendingTitle: "Hoje — agendado (projetado)",
                upcomingTitle: "A faturar (futuro)",
                upcomingHint: "Estimativa com base nos agendamentos confirmados",
                primaryLabel: "Faturamento",
                secondaryLabel: "Comissões prestadores",
                countLabel: "Atendimentos",
              }}
            />
          </div>
        </>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Agenda de hoje</h2>
            <Link to="/admin/agenda" className="text-xs font-medium text-gold hover:underline">
              Ver agenda completa →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-border">
            {todayAppointmentsQuery.isLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => (
                  <AdminAgendaRowSkeleton key={`ag-sk-${i}`} />
                ))}
              </div>
            ) : agendaHoje.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
            ) : (
              agendaHoje.map((a: { id: string; appointment_time: string; status: string; client?: { name?: string }; service?: { name?: string } }) => (
                <div key={a.id} className="flex items-center gap-4 py-3">
                  <div className="w-14 text-sm font-medium">{formatAppointmentTimeHm(a.appointment_time)}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.client?.name ?? "Cliente"}</div>
                    <div className="text-xs text-muted-foreground">{a.service?.name ?? "Serviço"}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${statusClass[a.status] ?? statusClass.scheduled}`}>
                    {statusLabel[a.status] ?? "Agendado"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2 text-gold">
              <Sparkles className="size-4" />
              <h3 className="font-display text-lg">Resumo rápido</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                Faturamento hoje:{" "}
                <span className="font-medium text-foreground">
                  {summaryQuery.isLoading ? "…" : formatCompanyMoney(summary?.today_revenue ?? 0)}
                </span>
              </p>
              <p>
                Comissões hoje:{" "}
                <span className="font-medium text-foreground">
                  {summaryQuery.isLoading ? "…" : formatCompanyMoney(summary?.today_commissions ?? 0)}
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-4" />
              <h3 className="text-sm font-semibold">Alertas importantes</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Lista de espera: próxima etapa</li>
              <li>Em breve: alertas automáticos de confirmação</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
