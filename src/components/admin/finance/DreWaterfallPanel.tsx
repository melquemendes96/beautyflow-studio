import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  financeService,
  formatFinanceMoney,
  type DreLine,
  type DrillDownItem,
} from "@/services/financeService";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const DRILLABLE_KEYS = new Set([
  "revenue_services",
  "revenue_products",
  "cogs_products",
  "cogs_consumables",
  "commissions_paid",
  "expenses_fixed",
  "expenses_variable",
  "prolabore",
  "tax",
  "expenses_other",
]);

type Props = {
  companyId: string;
  startDate: string;
  endDate: string;
  lines: DreLine[];
};

function lineStyle(kind: DreLine["kind"], amount: number) {
  if (kind === "total") return "bg-primary/10 font-semibold text-primary border-primary/20";
  if (kind === "subtotal") return "bg-muted/80 font-medium border-border";
  if (kind === "credit") return "text-emerald-700 dark:text-emerald-400";
  if (kind === "debit") return "text-rose-700 dark:text-rose-400";
  if (amount < 0) return "text-rose-700 dark:text-rose-400";
  return "";
}

function formatDrillDate(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function DreWaterfallPanel({ companyId, startDate, endDate, lines }: Props) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set(["revenue", "cogs"]));
  const [drillKey, setDrillKey] = useState<string | null>(null);

  const drillQuery = useQuery({
    queryKey: ["admin", "finance", "drill", companyId, startDate, endDate, drillKey],
    enabled: Boolean(drillKey),
    queryFn: async () => {
      const res = await financeService.getDrillDown(companyId, startDate, endDate, drillKey!);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res.items;
    },
  });

  const toggleParent = (key: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleLines = lines.filter((line) => {
    if (line.level === 0) return true;
    if (!line.parent) return true;
    return expandedParents.has(line.parent);
  });

  const drillLabel = lines.find((l) => l.key === drillKey)?.label;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/5 to-transparent px-5 py-4">
          <div>
            <h3 className="font-display text-lg">Demonstração do Resultado (DRE)</h3>
            <p className="text-xs text-muted-foreground">
              Comissões contabilizadas somente quando o repasse é marcado como pago
            </p>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground sm:flex">
            <Info className="size-3.5" />
            Clique nas linhas para ver detalhes
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {visibleLines.map((line) => {
            const isParent = lines.some((l) => l.parent === line.key);
            const canDrill = DRILLABLE_KEYS.has(line.key) && line.amount > 0;
            const isExpanded = expandedParents.has(line.key);

            return (
              <div
                key={line.key}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 transition-colors sm:px-5",
                  line.level === 1 && "bg-secondary/20 pl-8 sm:pl-10",
                  canDrill && "cursor-pointer hover:bg-accent/40",
                  lineStyle(line.kind, line.amount),
                )}
                onClick={() => {
                  if (isParent) toggleParent(line.key);
                  else if (canDrill) setDrillKey(line.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (isParent) toggleParent(line.key);
                    else if (canDrill) setDrillKey(line.key);
                  }
                }}
                role={isParent || canDrill ? "button" : undefined}
                tabIndex={isParent || canDrill ? 0 : undefined}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {isParent ? (
                    isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 opacity-60" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 opacity-60" />
                    )
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className={cn("truncate text-sm", line.level === 0 && line.kind !== "debit" && "font-medium")}>
                    {line.label}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono text-sm tabular-nums",
                    line.kind === "credit" && "text-emerald-600 dark:text-emerald-400",
                    line.kind === "debit" && "text-rose-600 dark:text-rose-400",
                    line.kind === "total" && "text-base font-bold text-primary",
                    line.kind === "subtotal" && "font-semibold",
                  )}
                >
                  {line.kind === "debit" && line.amount > 0 ? "−" : ""}
                  {formatFinanceMoney(Math.abs(line.amount))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <Sheet open={Boolean(drillKey)} onOpenChange={(open) => !open && setDrillKey(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{drillLabel ?? "Detalhes"}</SheetTitle>
            <SheetDescription>
              Movimentações do período selecionado
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-2">
            {drillQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            )}
            {drillQuery.isError && (
              <p className="text-sm text-destructive">Não foi possível carregar os detalhes.</p>
            )}
            {(drillQuery.data ?? []).length === 0 && drillQuery.isSuccess && (
              <p className="text-sm text-muted-foreground">Nenhum lançamento neste período.</p>
            )}
            {(drillQuery.data ?? []).map((item: DrillDownItem, i) => (
              <div
                key={`${item.reference}-${i}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.description}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDrillDate(item.date)}</p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {formatFinanceMoney(Number(item.amount))}
                </span>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
