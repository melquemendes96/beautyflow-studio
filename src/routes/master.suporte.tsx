import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/suporte")({
  component: MasterSuporte,
});

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    open: "Aberto",
    in_progress: "Em andamento",
    resolved: "Resolvido",
    closed: "Fechado",
  };
  return map[status] ?? status;
}

function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "—";
  const map: Record<string, string> = {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  };
  return map[priority] ?? priority;
}

function priorityVariant(priority: string | null | undefined): "default" | "secondary" | "destructive" {
  if (priority === "urgent") return "destructive";
  if (priority === "high") return "default";
  return "secondary";
}

function MasterSuporte() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "support_tickets"],
    queryFn: async () => {
      const res = await masterService.listSupportTickets();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  return (
    <div>
      <MasterPageTitle title="Suporte" subtitle="Tickets e solicitações da plataforma." />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${data?.length ?? 0} ticket(s)`}
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar os tickets.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Assunto</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Prioridade</th>
                <th className="px-5 py-3">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={4} />
                ))}
              {!isLoading &&
                (data ?? []).map((t: any) => (
                <tr key={t.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{t.subject}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.message}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{statusLabel(t.status)}</td>
                  <td className="px-5 py-4">
                    <Badge variant={priorityVariant(t.priority)}>{priorityLabel(t.priority)}</Badge>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-0" colSpan={4}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={LifeBuoy}
                        title="Nenhum ticket"
                        description="Solicitações enviadas pelas empresas pelo painel aparecerão aqui para acompanhamento."
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

