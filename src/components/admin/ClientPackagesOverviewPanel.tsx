import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { packageService, type ClientPackageRow } from "@/services/packageService";

const statusLabel: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const statusClass: Record<string, string> = {
  pending_payment: "bg-warning/20 text-warning",
  active: "bg-success/15 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

function sessionsLabel(pkg: ClientPackageRow) {
  const used = Number(pkg.used_sessions ?? 0);
  const total = Number(pkg.total_sessions ?? 0);
  const remaining = Math.max(total - used, 0);
  return `${used}/${total} usadas · ${remaining} restante(s)`;
}

export function ClientPackagesOverviewPanel({
  companyId,
  packagesEnabled,
  clientId,
  compact,
}: {
  companyId: string | null;
  packagesEnabled: boolean;
  clientId?: string | null;
  compact?: boolean;
}) {
  const packagesQuery = useQuery({
    queryKey: ["admin", "packages", "list", companyId, clientId ?? "all"],
    enabled: Boolean(companyId) && packagesEnabled,
    queryFn: async () => {
      const res = await packageService.listByCompany(companyId!, clientId ?? undefined);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    staleTime: 15_000,
  });

  const list = (packagesQuery.data ?? []).filter((p) => p.status !== "cancelled");
  if (!packagesEnabled || packagesQuery.isLoading || list.length === 0) return null;

  return (
    <div className={`rounded-2xl border border-border bg-card shadow-soft ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <Package className="mt-0.5 size-5 shrink-0 text-purple-soft" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {clientId ? "Pacotes desta cliente" : "Pacotes do studio"}
          </h3>
          {!compact ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Status e sessões dos pacotes desta cliente. Pagamento de pacote novo é confirmado ao fechar a comanda na
              agenda ou em Comandas.
            </p>
          ) : null}
          <ul className={`space-y-2 ${compact ? "mt-3" : "mt-4"}`}>
            {list.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{pkg.client_name ?? "Cliente"}</div>
                  <div className="text-xs text-muted-foreground">
                    {pkg.service_name ?? "Serviço"} · {sessionsLabel(pkg)}
                  </div>
                </div>
                <span
                  className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    statusClass[pkg.status] ?? "bg-secondary text-foreground"
                  }`}
                >
                  {statusLabel[pkg.status] ?? pkg.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
