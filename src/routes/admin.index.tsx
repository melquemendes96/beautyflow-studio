import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { Calendar, Users, Wallet, TrendingUp, Sparkles, AlertTriangle, CheckCircle2, Percent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAgendaRowSkeleton, AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { compareAppointmentTime, formatAppointmentTimeHm } from "@/lib/appointment-time";
import { useCurrentCompany } from "@/lib/current-company";
import { hasFeatureAccess } from "@/lib/plan-access";
import { PendingPackagePaymentsPanel } from "@/components/admin/PendingPackagePaymentsPanel";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentService } from "@/services/appointmentService";
import { clientService } from "@/services/clientService";
import { companyService } from "@/services/companyService";
import { onboardingService } from "@/services/onboardingService";
import {
  formatPeriodRange,
  formatProviderMoney,
  periodKindLabel,
  providerService,
  type ProviderCommissionPeriod,
} from "@/services/providerService";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

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

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function ProviderDashboard() {
  const { companyId, hasCompany } = useCurrentCompany();

  const packagesQuery = useQuery({
    queryKey: ["admin", "feature", "packages", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "packages"),
  });

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

  const summary = dashboardQuery.data?.summary;
  const pct = dashboardQuery.data?.commission_pct ?? 0;

  const periodsByKind = useMemo(() => {
    const list = dashboardQuery.data?.periods ?? [];
    const groups: Record<string, ProviderCommissionPeriod[]> = { week: [], biweek: [], month: [] };
    for (const p of list) {
      groups[p.kind]?.push(p);
    }
    return groups;
  }, [dashboardQuery.data?.periods]);

  const stats = [
    {
      icon: Wallet,
      label: "Faturamento hoje",
      value: summary ? formatProviderMoney(summary.today_revenue) : "—",
      sub: summary ? `${summary.today_appointments} atendimento(s)` : "",
      color: "text-success",
    },
    {
      icon: Percent,
      label: "Comissão hoje",
      value: summary ? formatProviderMoney(summary.today_commission) : "—",
      sub: `${pct}% sobre serviços concluídos`,
      color: "text-gold",
    },
    {
      icon: TrendingUp,
      label: "Comissão na semana",
      value: summary ? formatProviderMoney(summary.week_commission) : "—",
      sub: summary ? formatProviderMoney(summary.week_revenue) + " faturados" : "",
      color: "text-info",
    },
    {
      icon: Calendar,
      label: "Comissão no mês",
      value: summary ? formatProviderMoney(summary.month_commission) : "—",
      sub: summary ? formatProviderMoney(summary.month_revenue) + " faturados" : "",
      color: "text-purple-soft",
    },
  ];

  return (
    <div>
      <PageTitle
        title="Meu desempenho"
        subtitle={
          dashboardQuery.data?.display_name
            ? `${dashboardQuery.data.display_name} · comissão de ${pct}%`
            : "Faturamento e comissão dos seus atendimentos concluídos"
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

      <PendingPackagePaymentsPanel
        companyId={companyId}
        packagesEnabled={Boolean(packagesQuery.data)}
      />

      {dashboardQuery.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar seus números. Tente atualizar a página.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboardQuery.isLoading
              ? Array.from({ length: 4 }).map((_, i) => <AdminKpiCardSkeleton key={`prov-kpi-${i}`} />)
              : stats.map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <s.icon className={`size-4 ${s.color}`} />
                    </div>
                    <div className="mt-3 font-display text-3xl">{s.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
                  </div>
                ))}
          </div>

          <div className="mt-8 space-y-6">
            {(["week", "biweek", "month"] as const).map((kind) => {
              const rows = periodsByKind[kind] ?? [];
              if (dashboardQuery.isLoading) {
                return (
                  <div key={kind} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                    <Skeleton className="h-6 w-40" />
                    <div className="mt-4 space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  </div>
                );
              }
              if (rows.length === 0) return null;
              return (
                <div key={kind} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <h2 className="font-display text-xl">Comissão por {periodKindLabel(kind).toLowerCase()}</h2>
                  <div className="mt-4 divide-y divide-border">
                    {rows.map((row) => (
                      <div
                        key={`${row.kind}-${row.start_date}`}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                      >
                        <div>
                          <div className="font-medium">{formatPeriodRange(row.start_date, row.end_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.appointments} atendimento(s) concluído(s)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-lg text-gold">{formatProviderMoney(row.commission)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatProviderMoney(row.revenue)} faturados
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function OwnerDashboard() {
  const { companyId, hasCompany } = useCurrentCompany();
  const queryClient = useQueryClient();

  const packagesQuery = useQuery({
    queryKey: ["admin", "feature", "packages", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "packages"),
  });

  const companyQuery = useQuery({
    queryKey: ["admin", "company", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyService.getByIdForAdmin(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
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

  const today = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toYmd(today), [today]);

  const clientsQuery = useQuery({
    queryKey: ["admin", "clients", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await clientService.listByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const todayAppointmentsQuery = useQuery({
    queryKey: ["admin", "agenda", "day", companyId, todayYmd],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await appointmentService.listByCompanyAndDate(companyId!, todayYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const last30DaysStart = useMemo(() => toYmd(addDays(today, -30)), [today]);
  const last30DaysQuery = useQuery({
    queryKey: ["admin", "kpis", "appointments30d", companyId, last30DaysStart, todayYmd],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await appointmentService.listByCompanyForRange(companyId!, last30DaysStart, todayYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const kpis = useMemo(() => {
    const clientsCount = clientsQuery.data?.length ?? 0;
    const todayList = todayAppointmentsQuery.data ?? [];
    const last30 = last30DaysQuery.data ?? [];

    const atendimentosHoje = todayList.filter((a: any) => a.status !== "cancelled").length;
    const faturamentoHoje = todayList
      .filter((a: any) => a.status !== "cancelled" && a.status !== "no_show")
      .reduce((sum: number, a: any) => sum + Number(a.service?.price ?? 0), 0);

    const completed = last30.filter((a: any) => a.status === "completed").length;
    const noShow = last30.filter((a: any) => a.status === "no_show").length;
    const attendedTotal = completed + noShow;
    const comparecimento = attendedTotal > 0 ? Math.round((completed / attendedTotal) * 100) : 0;

    const serviceCounts = new Map<string, number>();
    for (const a of last30) {
      if (a.status === "cancelled") continue;
      const name = a.service?.name ?? "Serviço";
      serviceCounts.set(name, (serviceCounts.get(name) ?? 0) + 1);
    }
    let topService = { name: "—", pct: 0 };
    if (serviceCounts.size > 0) {
      const total = Array.from(serviceCounts.values()).reduce((s, v) => s + v, 0);
      const sorted = Array.from(serviceCounts.entries()).sort((a, b) => b[1] - a[1]);
      const [name, count] = sorted[0];
      topService = { name, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    }

    return {
      clientsCount,
      atendimentosHoje,
      faturamentoHoje,
      comparecimento,
      topService,
    };
  }, [clientsQuery.data, last30DaysQuery.data, todayAppointmentsQuery.data]);

  const stats = useMemo(
    () => [
      {
        icon: Calendar,
        label: "Atendimentos hoje",
        value: todayAppointmentsQuery.isLoading ? "—" : String(kpis.atendimentosHoje),
        trend: "Atualizado em tempo real",
        color: "text-info",
      },
      {
        icon: Users,
        label: "Clientes cadastrados",
        value: clientsQuery.isLoading ? "—" : String(kpis.clientsCount),
        trend: "Base total do studio",
        color: "text-purple-soft",
      },
      {
        icon: Wallet,
        label: "Faturamento estimado",
        value: todayAppointmentsQuery.isLoading ? "—" : `R$ ${kpis.faturamentoHoje.toFixed(2).replace(".", ",")}`,
        trend: "Estimativa do dia",
        color: "text-success",
      },
      {
        icon: TrendingUp,
        label: "Taxa de comparecimento",
        value: last30DaysQuery.isLoading ? "—" : `${kpis.comparecimento}%`,
        trend: "Últimos 30 dias",
        color: "text-gold",
      },
    ],
    [clientsQuery.isLoading, kpis, last30DaysQuery.isLoading, todayAppointmentsQuery.isLoading],
  );

  const agendaHoje = useMemo(() => {
    const list = (todayAppointmentsQuery.data ?? []).slice().sort((a: any, b: any) => compareAppointmentTime(a.appointment_time, b.appointment_time));
    return list.slice(0, 5);
  }, [todayAppointmentsQuery.data]);

  const kpiLoading =
    hasCompany &&
    (clientsQuery.isLoading || todayAppointmentsQuery.isLoading || last30DaysQuery.isLoading);

  const showOnboardingCard =
    hasCompany && companyQuery.data && companyQuery.data.onboarding_completed === false;

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Visão geral do seu studio hoje" />

      <PendingPackagePaymentsPanel
        companyId={companyId}
        packagesEnabled={Boolean(packagesQuery.data)}
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
                Sua agenda está quase pronta para receber clientes. Complete a identidade visual, os horários de
                atendimento e ao menos um serviço. Depois, finalize para liberar o painel sem lembretes desta etapa.
              </p>
              <ol className="mt-4 flex flex-wrap gap-3 text-sm">
                <li>
                  <Link to="/admin/branding" className="font-medium text-foreground underline-offset-4 hover:underline">
                    1. Aparência da marca
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/configuracoes"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiLoading
          ? Array.from({ length: 4 }).map((_, i) => <AdminKpiCardSkeleton key={`kpi-sk-${i}`} />)
          : stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className={`size-4 ${s.color}`} />
                </div>
                <div className="mt-3 font-display text-3xl">{s.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.trend}</div>
              </div>
            ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Agenda de hoje</h2>
            <span className="text-xs text-muted-foreground">
              {todayAppointmentsQuery.isLoading ? "…" : `${agendaHoje.length} horários`}
            </span>
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
              agendaHoje.map((a: any) => (
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
              <h3 className="font-display text-lg">Serviço mais agendado</h3>
            </div>
            <div className="mt-3 text-2xl font-display">
              {last30DaysQuery.isLoading ? <Skeleton className="h-8 w-40" /> : kpis.topService.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {last30DaysQuery.isLoading ? (
                <Skeleton className="mt-1 h-3 w-48" />
              ) : (
                `${kpis.topService.pct}% dos agendamentos`
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-4" />
              <h3 className="text-sm font-semibold">Alertas importantes</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Conectaremos a lista de espera na próxima etapa</li>
              <li>Em breve: alertas automáticos de confirmação e bloqueios</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { isProvider } = useCurrentCompany();
  if (isProvider) return <ProviderDashboard />;
  return <OwnerDashboard />;
}
