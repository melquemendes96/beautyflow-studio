import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/inadimplentes")({
  component: MasterInadimplentes,
});

function MasterInadimplentes() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "subscriptions"],
    queryFn: async () => {
      const res = await masterService.listSubscriptions();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const rows = (data ?? []).filter((s: any) => s.status === "past_due");

  return (
    <div>
      <MasterPageTitle
        title="Inadimplentes"
        subtitle="Assinaturas em atraso que exigem ação."
      />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${rows.length} empresa(s) em atraso`}
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar os dados.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Renovação</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={5} />
                ))}
              {!isLoading &&
                rows.map((s: any) => (
                <tr key={s.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{s.companies?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.companies?.slug ?? ""}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {s.plans?.name ?? "—"} {s.plans?.price != null ? `· R$ ${Number(s.plans.price).toFixed(2)}` : ""}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant="destructive">Em atraso</Badge>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link to="/master/assinaturas" className="text-sm font-medium text-gold hover:underline">
                      Ver assinatura →
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={5}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={CheckCircle2}
                        title="Nenhuma inadimplência"
                        description="Não há assinaturas com status em atraso no momento. Empresas com pagamento pendente aparecerão aqui."
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

