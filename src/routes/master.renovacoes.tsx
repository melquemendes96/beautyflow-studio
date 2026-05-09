import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/renovacoes")({
  component: MasterRenovacoes,
});

function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const end = new Date(dateIso);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function badgeVariant(days: number | null): "default" | "secondary" | "destructive" {
  if (days == null) return "secondary";
  if (days <= 3) return "destructive";
  if (days <= 10) return "default";
  return "secondary";
}

function MasterRenovacoes() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "subscriptions"],
    queryFn: async () => {
      const res = await masterService.listSubscriptions();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const rows = useMemo(() => {
    return (data ?? [])
      .map((s: any) => ({
        id: s.id as string,
        companyName: s.companies?.name as string | undefined,
        companySlug: s.companies?.slug as string | undefined,
        planName: s.plans?.name as string | undefined,
        status: s.status as string | undefined,
        periodEnd: s.current_period_end as string | null | undefined,
        days: daysUntil(s.current_period_end),
      }))
      .sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999));
  }, [data]);

  return (
    <div>
      <MasterPageTitle
        title="Renovações"
        subtitle="Acompanhe empresas com renovação próxima e possíveis riscos de inadimplência."
      />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${rows.length} registro(s)`}
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar as renovações.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Renova em</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={4} />
                ))}
              {!isLoading &&
                rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{r.companyName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.companySlug ?? ""}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{r.planName ?? "—"}</td>
                  <td className="px-5 py-4 text-muted-foreground">{r.status ?? "—"}</td>
                  <td className="px-5 py-4">
                    <Badge variant={badgeVariant(r.days)}>
                      {r.days == null ? "—" : `${r.days} dia(s)`}
                    </Badge>
                  </td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={4}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={CalendarClock}
                        title="Sem assinaturas para exibir"
                        description="Quando houver empresas com assinatura ativa ou em teste, os prazos de renovação aparecerão nesta lista ordenada por urgência."
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

