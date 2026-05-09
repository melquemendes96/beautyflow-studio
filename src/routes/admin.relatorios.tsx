import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentCompany } from "@/lib/current-company";
import { appointmentService } from "@/services/appointmentService";
import { serviceService } from "@/services/serviceService";
import {
  AdminReportBarChartSkeleton,
  AdminReportHeroCardSkeleton,
  AdminReportServiceRowSkeleton,
} from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/admin/relatorios")({
  component: Relatorios,
});

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").replace(/^./, (c) => c.toUpperCase());
}

function Relatorios() {
  const { companyId, hasCompany } = useCurrentCompany();
  const now = useMemo(() => new Date(), []);
  const start = useMemo(() => startOfMonth(addMonths(now, -5)), [now]);
  const end = useMemo(() => now, [now]);
  const startYmd = useMemo(() => toYmd(start), [start]);
  const endYmd = useMemo(() => toYmd(end), [end]);

  const apptsQuery = useQuery({
    queryKey: ["admin", "reports", "appts", companyId, startYmd, endYmd],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await appointmentService.listByCompanyForRangeLite(companyId!, startYmd, endYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const servicesQuery = useQuery({
    queryKey: ["admin", "services", "prices", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await serviceService.listByCompanyWithPrices(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const derived = useMemo(() => {
    const appts = apptsQuery.data ?? [];
    const services = servicesQuery.data ?? [];
    const priceById = new Map<string, number>();
    const nameById = new Map<string, string>();
    for (const s of services as any[]) {
      priceById.set(s.id, Number(s.price ?? 0));
      nameById.set(s.id, String(s.name ?? "Serviço"));
    }

    // meses: últimos 6 meses (inclui o atual)
    const months: { key: string; m: string; v: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = addMonths(startOfMonth(now), -5 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, m: monthLabel(d), v: 0 });
    }
    const idxByKey = new Map(months.map((x, i) => [x.key, i]));

    let cancelled = 0;
    let noShow = 0;
    let completed = 0;
    let totalAttended = 0;
    let revenue = 0;
    const byService = new Map<string, number>();
    const byHourBand = new Map<string, number>([
      ["08:00 — 10:00", 0],
      ["10:00 — 12:00", 0],
      ["12:00 — 14:00", 0],
      ["14:00 — 16:00", 0],
      ["16:00 — 18:00", 0],
      ["18:00 — 20:00", 0],
    ]);

    const hourBand = (time: string) => {
      const h = Number(String(time).slice(0, 2));
      if (h < 10) return "08:00 — 10:00";
      if (h < 12) return "10:00 — 12:00";
      if (h < 14) return "12:00 — 14:00";
      if (h < 16) return "14:00 — 16:00";
      if (h < 18) return "16:00 — 18:00";
      return "18:00 — 20:00";
    };

    for (const a of appts as any[]) {
      const y = String(a.appointment_date ?? "").slice(0, 7);
      const mi = idxByKey.get(y);
      if (mi !== undefined) months[mi].v += 1;

      const st = a.status;
      if (st === "cancelled") cancelled += 1;
      if (st === "no_show") noShow += 1;
      if (st === "completed") completed += 1;

      if (st !== "cancelled") {
        const band = hourBand(String(a.appointment_time ?? "00:00"));
        byHourBand.set(band, (byHourBand.get(band) ?? 0) + 1);
      }

      if (st !== "cancelled" && st !== "no_show") {
        totalAttended += 1;
        const price = priceById.get(a.service_id) ?? 0;
        revenue += price;
        const name = nameById.get(a.service_id) ?? "Serviço";
        byService.set(name, (byService.get(name) ?? 0) + 1);
      }
    }

    const comparecimento = completed + noShow > 0 ? Math.round((completed / (completed + noShow)) * 100) : 0;

    const topServices = Array.from(byService.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n, v]) => ({ n, v }));

    const maxMonth = Math.max(1, ...months.map((m) => m.v));

    const topHourBand = Array.from(byHourBand.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return {
      months,
      maxMonth,
      topServices,
      revenue,
      comparecimento,
      recurring: totalAttended > 0 ? Math.min(95, Math.max(0, Math.round((totalAttended / Math.max(1, appts.length)) * 100))) : 0,
      topHourBand,
      cancelled,
      noShow,
    };
  }, [apptsQuery.data, now, servicesQuery.data]);

  const max = derived.maxMonth;
  const reportsLoading = apptsQuery.isLoading || servicesQuery.isLoading;

  return (
    <div>
      <PageTitle title="Relatórios" subtitle="Insights do seu studio" />

      <div className="grid gap-4 md:grid-cols-3">
        {reportsLoading
          ? Array.from({ length: 3 }).map((_, i) => <AdminReportHeroCardSkeleton key={`rep-hero-${i}`} />)
          : [
              {
                l: "Faturamento estimado",
                v: `R$ ${derived.revenue.toFixed(2).replace(".", ",")}`,
                t: "Últimos 6 meses (estimativa)",
              },
              { l: "Taxa de comparecimento", v: `${derived.comparecimento}%`, t: "Baseado em concluídos vs faltas" },
              { l: "Clientes recorrentes", v: `${derived.recurring}%`, t: "Ajustaremos com métrica real na Fase 9" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className="mt-2 font-display text-3xl">{s.v}</div>
                <div className="text-xs text-success">{s.t}</div>
              </div>
            ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h2 className="font-display text-xl">Atendimentos por mês</h2>
          {apptsQuery.isLoading ? (
            <div className="mt-6">
              <AdminReportBarChartSkeleton />
            </div>
          ) : (
            <div className="mt-6 flex h-56 items-end gap-2 sm:gap-3">
              {derived.months.map((m) => (
                <div key={m.m} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full min-h-[4px] rounded-t-xl bg-gradient-to-t from-gold to-gold-soft transition hover:opacity-80"
                    style={{ height: `${(m.v / max) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground sm:text-xs">{m.m}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl">Serviços mais agendados</h2>
          <div className="mt-5 space-y-4">
            {apptsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <AdminReportServiceRowSkeleton key={`svc-sk-${i}`} />)
            ) : (
              <>
                {derived.topServices.map((s) => (
                  <div key={s.n}>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{s.n}</span>
                      <span className="shrink-0 text-muted-foreground">{s.v}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-foreground" style={{ width: `${Math.min(100, s.v * 6)}%` }} />
                    </div>
                  </div>
                ))}
                {derived.topServices.length === 0 && (
                  <div className="text-sm text-muted-foreground">Sem dados no período.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {reportsLoading
          ? Array.from({ length: 3 }).map((_, i) => <AdminReportHeroCardSkeleton key={`rep-foot-${i}`} />)
          : [
              { l: "Horário mais procurado", v: derived.topHourBand },
              { l: "Cancelamentos", v: `${derived.cancelled} no período`, c: "text-warning" },
              { l: "Não comparecimentos", v: `${derived.noShow} no período`, c: "text-destructive" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className={`mt-2 font-display text-2xl ${s.c || ""}`}>{s.v}</div>
              </div>
            ))}
      </div>
    </div>
  );
}
