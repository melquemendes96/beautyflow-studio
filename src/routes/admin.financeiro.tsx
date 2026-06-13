import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Landmark,
  PiggyBank,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageTitle } from "@/components/admin/AdminShell";
import { DreWaterfallPanel } from "@/components/admin/finance/DreWaterfallPanel";
import { FinancialExpensesPanel } from "@/components/admin/finance/FinancialExpensesPanel";
import { FinancialTrendChart } from "@/components/admin/finance/FinancialTrendChart";
import { AdminKpiCardSkeleton } from "@/components/admin/AdminPageStates";
import { FinancialPeriodPicker } from "@/components/admin/finance/FinancialPeriodPicker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentCompany } from "@/lib/current-company";
import { endOfMonth, startOfMonth, toYmd } from "@/lib/intelligent-calendar-range";
import { cn } from "@/lib/utils";
import { companyService } from "@/services/companyService";
import {
  exportDreCsv,
  financeService,
  formatFinanceMoney,
  type FinancialDre,
} from "@/services/financeService";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/financeiro")({
  component: Financeiro,
});

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão crédito",
  cartao_debito: "Cartão débito",
  outro: "Outro",
};

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof Wallet;
  tone?: "default" | "success" | "danger" | "primary";
}) {
  const tones = {
    default: "from-muted/40 to-card border-border",
    success: "from-emerald-500/10 to-card border-emerald-500/20",
    danger: "from-rose-500/10 to-card border-rose-500/20",
    primary: "from-primary/10 to-card border-primary/25",
  };
  const iconTones = {
    default: "bg-muted text-foreground",
    success: "bg-emerald-500/15 text-emerald-600",
    danger: "bg-rose-500/15 text-rose-600",
    primary: "bg-primary/15 text-primary",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-elegant",
        tones[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn("rounded-xl p-2.5", iconTones[tone])}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

function Financeiro() {
  const { companyId, hasCompany, isOwnerAdmin } = useCurrentCompany();
  const [tab, setTab] = useState("visao");
  const [periodStart, setPeriodStart] = useState(() => toYmd(startOfMonth(new Date())));
  const [periodEnd, setPeriodEnd] = useState(() => toYmd(endOfMonth(new Date())));

  const handlePeriodChange = (start: string, end: string) => {
    setPeriodStart(start <= end ? start : end);
    setPeriodEnd(start <= end ? end : start);
  };

  const companyQuery = useQuery({
    queryKey: ["admin", "company", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyService.getByIdForAdmin(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const dreQuery = useQuery({
    queryKey: ["admin", "finance", "dre", companyId, periodStart, periodEnd],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: async () => {
      const res = await financeService.getDre(companyId!, periodStart, periodEnd);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    retry: false,
  });

  const cashQuery = useQuery({
    queryKey: ["admin", "finance", "cash", companyId, periodStart, periodEnd],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: async () => {
      const res = await financeService.getCashFlow(companyId!, periodStart, periodEnd);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    retry: false,
  });

  const trendQuery = useQuery({
    queryKey: ["admin", "finance", "trend", companyId],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: async () => {
      const res = await financeService.getTrend(companyId!, 6);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res.months ?? [];
    },
    retry: false,
  });

  const entriesQuery = useQuery({
    queryKey: ["admin", "finance", "entries", companyId, periodStart, periodEnd],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: async () => {
      const res = await financeService.listEntries(companyId!, periodStart, periodEnd);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res.entries ?? [];
    },
    retry: false,
  });

  const dre = dreQuery.data;
  const rpcMissing = dreQuery.isError && String((dreQuery.error as Error)?.message ?? "").includes("rpc_ausente");

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!dre?.ok) throw new Error("DRE indisponível para exportar.");
      const companyName = companyQuery.data?.name ?? "Salão";
      const csv = exportDreCsv(dre as FinancialDre, companyName);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dre-${periodStart}-${periodEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("DRE exportada para o contador."),
    onError: (err: Error) => toast.error(err.message),
  });

  const marginSubtitle = useMemo(() => {
    if (!dre?.margin_pct && dre?.margin_pct !== 0) return undefined;
    const m = dre.margin_pct;
    if (m >= 20) return "Margem saudável no período";
    if (m >= 0) return "Acompanhe despesas fixas";
    return "Despesas acima da receita";
  }, [dre?.margin_pct]);

  if (!isOwnerAdmin) {
    return (
      <div>
        <PageTitle title="Gestão Financeira" subtitle="Disponível apenas para administradores." />
        <p className="text-sm text-muted-foreground">Peça acesso ao administrador do salão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-purple-soft/10 p-6 shadow-elegant sm:p-8">
        <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 size-32 rounded-full bg-purple-soft/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              Gestão Financeira
            </div>
            <PageTitle
              title="Painel financeiro"
              subtitle="DRE automática a partir das comandas, repasses pagos e despesas cadastradas."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full bg-background/80"
              disabled={!dre?.ok || exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              <Download className="mr-1.5 size-4" />
              Exportar DRE
            </Button>
          </div>
        </div>

        <div className="relative mt-6">
          <FinancialPeriodPicker
            start={periodStart}
            end={periodEnd}
            onChange={handlePeriodChange}
          />
        </div>
      </div>

      {rpcMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm">
          Execute a migration{" "}
          <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs">
            20260615000000_financial_management.sql
          </code>{" "}
          no Supabase e ative o recurso <strong>Gestão Financeira</strong> no plano (Master → Planos).
        </div>
      )}

      {dreQuery.isError && !rpcMissing && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive">
          {(dreQuery.error as Error).message}
        </div>
      )}

      {dreQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AdminKpiCardSkeleton key={i} />
          ))}
        </div>
      ) : dre?.ok ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Receita bruta"
            value={formatFinanceMoney(dre.revenue?.total ?? 0)}
            subtitle={`Serviços ${formatFinanceMoney(dre.revenue?.services ?? 0)} · Produtos ${formatFinanceMoney(dre.revenue?.products ?? 0)}`}
            icon={TrendingUp}
            tone="success"
          />
          <KpiCard
            title="Lucro bruto"
            value={formatFinanceMoney(dre.gross_profit ?? 0)}
            subtitle={`CMV ${formatFinanceMoney(dre.cogs?.total ?? 0)}`}
            icon={ArrowUpRight}
            tone="primary"
          />
          <KpiCard
            title="Resultado líquido"
            value={formatFinanceMoney(dre.net_result ?? 0)}
            subtitle={marginSubtitle}
            icon={PiggyBank}
            tone={(dre.net_result ?? 0) >= 0 ? "success" : "danger"}
          />
          <KpiCard
            title="Fluxo de caixa"
            value={formatFinanceMoney(cashQuery.data?.net_cash ?? 0)}
            subtitle={`Entradas ${formatFinanceMoney(cashQuery.data?.inflows ?? 0)}`}
            icon={Wallet}
            tone="default"
          />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl bg-muted/60 p-1 sm:w-auto sm:inline-flex">
          <TabsTrigger value="visao" className="rounded-xl">
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="dre" className="rounded-xl">
            DRE
          </TabsTrigger>
          <TabsTrigger value="despesas" className="rounded-xl">
            Despesas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant lg:col-span-3">
              <h3 className="font-display text-lg">Evolução — 6 meses</h3>
              <p className="mb-4 text-xs text-muted-foreground">Receita vs resultado líquido</p>
              {trendQuery.isLoading ? (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  Carregando gráfico…
                </div>
              ) : (trendQuery.data ?? []).length > 0 ? (
                <FinancialTrendChart data={trendQuery.data ?? []} />
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              )}
            </div>

            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
                <div className="mb-3 flex items-center gap-2">
                  <Landmark className="size-4 text-primary" />
                  <h3 className="font-display text-base">Fluxo de caixa</h3>
                </div>
                {cashQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : cashQuery.data?.ok ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entradas (comandas)</span>
                      <span className="font-mono text-emerald-600">
                        +{formatFinanceMoney(cashQuery.data.inflows ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comissões pagas</span>
                      <span className="font-mono text-rose-600">
                        −{formatFinanceMoney(cashQuery.data.outflows?.commissions ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Despesas pagas</span>
                      <span className="font-mono text-rose-600">
                        −{formatFinanceMoney(cashQuery.data.outflows?.expenses ?? 0)}
                      </span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between font-medium">
                      <span>Saldo do período</span>
                      <span className={cn("font-mono", (cashQuery.data.net_cash ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {formatFinanceMoney(cashQuery.data.net_cash ?? 0)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
                <h3 className="mb-3 font-display text-base">Receita por forma de pagamento</h3>
                <div className="space-y-2">
                  {Object.entries(cashQuery.data?.inflows_by_method ?? {}).map(([method, amount]) => (
                    <div key={method} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{PAYMENT_LABELS[method] ?? method}</span>
                      <span className="font-mono tabular-nums">{formatFinanceMoney(Number(amount))}</span>
                    </div>
                  ))}
                  {Object.keys(cashQuery.data?.inflows_by_method ?? {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma comanda fechada no período.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-xs text-muted-foreground">
                <ArrowDownRight className="mb-1 size-4 text-primary" />
                Margem líquida:{" "}
                <strong className="text-foreground">{dre?.margin_pct ?? 0}%</strong> · Comissões na DRE
                entram apenas quando o repasse é pago.
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dre" className="mt-0">
          {dre?.lines && companyId ? (
            <DreWaterfallPanel
              companyId={companyId}
              startDate={periodStart}
              endDate={periodEnd}
              lines={dre.lines}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Carregue a DRE selecionando um período.</p>
          )}
        </TabsContent>

        <TabsContent value="despesas" className="mt-0">
          {companyId && (
            <FinancialExpensesPanel
              companyId={companyId}
              entries={entriesQuery.data ?? []}
              isLoading={entriesQuery.isLoading}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
