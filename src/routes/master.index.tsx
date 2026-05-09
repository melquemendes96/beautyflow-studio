import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { useAuth } from "@/contexts/AuthProvider";
import { masterService } from "@/services/masterService";
import { Building2, TrendingUp, Wallet, Ticket } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/")({
  component: MasterDashboard,
});

function MasterDashboard() {
  const { companyMemberships } = useAuth();
  const hasCompanyPanel = companyMemberships.length > 0;

  const companiesQuery = useQuery({
    queryKey: ["master", "companies"],
    queryFn: async () => {
      const res = await masterService.listCompanies();
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

  const ticketsQuery = useQuery({
    queryKey: ["master", "support_tickets"],
    queryFn: async () => {
      const res = await masterService.listSupportTickets();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const companiesCount = companiesQuery.data?.length ?? 0;
  const activeSubsCount =
    subsQuery.data?.filter((s: any) => s.status === "active" || s.status === "trialing").length ?? 0;
  const pastDueCount = subsQuery.data?.filter((s: any) => s.status === "past_due").length ?? 0;
  const openTicketsCount =
    ticketsQuery.data?.filter((t: any) => t.status === "open" || t.status === "in_progress").length ??
    0;
  const mrr =
    subsQuery.data
      ?.filter((s: any) => s.status === "active" || s.status === "trialing")
      .reduce((acc: number, s: any) => acc + (s.plans?.price != null ? Number(s.plans.price) : 0), 0) ?? 0;

  const mrrByPlan =
    subsQuery.data
      ?.filter((s: any) => s.status === "active" || s.status === "trialing")
      .reduce((acc: Record<string, { name: string; mrr: number; count: number }>, s: any) => {
        const key = s.plan_id ?? "sem_plano";
        const name = s.plans?.name ?? "Sem plano";
        const price = s.plans?.price != null ? Number(s.plans.price) : 0;
        const cur = acc[key] ?? { name, mrr: 0, count: 0 };
        cur.mrr += price;
        cur.count += 1;
        acc[key] = cur;
        return acc;
      }, {}) ?? {};

  const topCardsLoading =
    companiesQuery.isLoading || subsQuery.isLoading || ticketsQuery.isLoading;

  return (
    <div>
      <MasterPageTitle
        title="Dashboard Master"
        subtitle="Visão geral da plataforma BeautyFlow."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topCardsLoading ? (
          <>
            <AdminKpiCardSkeleton />
            <AdminKpiCardSkeleton />
            <AdminKpiCardSkeleton />
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft md:col-span-2 xl:col-span-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-4 w-full max-w-sm" />
              <Skeleton className="mt-4 h-4 w-40" />
              <Skeleton className="mt-3 h-4 w-44" />
              <Skeleton className="mt-4 h-4 w-48" />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Building2 className="size-4" /> Empresas
              </div>
              <div className="mt-3 font-display text-3xl">{companiesCount}</div>
              <p className="mt-1 text-sm text-muted-foreground">Cadastradas</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="size-4" /> Assinaturas
              </div>
              <div className="mt-3 font-display text-3xl">{activeSubsCount}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Ativas/teste {pastDueCount > 0 ? `· ${pastDueCount} em atraso` : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Wallet className="size-4" /> MRR estimado
              </div>
              <div className="mt-3 font-display text-3xl">
                {mrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Soma dos planos (ativas/teste){pastDueCount > 0 ? ` · ${pastDueCount} em atraso` : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft md:col-span-2 xl:col-span-1">
              <p className="text-sm font-medium text-foreground">Acesso rápido</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Você está autenticado como administrador da plataforma.
              </p>
              {hasCompanyPanel && (
                <Link
                  to="/admin"
                  className="mt-4 inline-flex text-sm font-medium text-gold hover:underline"
                >
                  Ir ao painel da empresa →
                </Link>
              )}
              <Link to="/master/empresas" className="mt-3 inline-flex text-sm font-medium text-gold hover:underline">
                Gerenciar empresas →
              </Link>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Ticket className="size-4" /> {openTicketsCount} ticket(s) em aberto
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="text-sm font-medium text-foreground">MRR por plano</div>
          <div className="mt-4 space-y-3">
            {subsQuery.isLoading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </>
            ) : Object.keys(mrrByPlan).length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem assinaturas ativas ou em teste com plano vinculado.</div>
            ) : (
              Object.entries(mrrByPlan)
                .sort((a, b) => b[1].mrr - a[1].mrr)
                .map(([key, v]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.count} assinatura(s)</div>
                    </div>
                    <div className="shrink-0 text-sm font-medium">
                      {v.mrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="text-sm font-medium text-foreground">Risco</div>
          {subsQuery.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full max-w-xs" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <>
              <div className="mt-3 text-sm text-muted-foreground">
                {pastDueCount > 0
                  ? `${pastDueCount} assinatura(s) em atraso.`
                  : "Nenhuma assinatura em atraso no momento."}
              </div>
              <Link to="/master/inadimplentes" className="mt-4 inline-flex text-sm font-medium text-gold hover:underline">
                Ver inadimplentes →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
