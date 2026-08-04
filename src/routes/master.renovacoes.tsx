import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/renovacoes")({
  component: MasterRenovacoes,
});

type SubRow = {
  id: string;
  company_id?: string;
  plan_id?: string;
  status?: string | null;
  current_period_end?: string | null;
  companies?: { name?: string | null; slug?: string | null } | null;
  plans?: { name?: string | null; price?: number | string | null } | null;
};

type TabKey = "urgentes" | "30dias" | "trial" | "todas";

function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const end = new Date(dateIso);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    trialing: "Teste",
    active: "Ativa",
    past_due: "Em atraso",
    canceled: "Cancelada",
    paused: "Pausada",
    pending_payment: "Aguardando pagamento",
    trial_expired: "Trial expirado",
  };
  return map[status] ?? status;
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "trialing") return "outline";
  if (status === "past_due" || status === "trial_expired") return "destructive";
  return "secondary";
}

function moneyBRL(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function urgencyLabel(days: number | null): string {
  if (days == null) return "Sem data";
  if (days < 0) return `Vencida há ${Math.abs(days)} dia(s)`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Em ${days} dia(s)`;
}

function urgencyVariant(days: number | null): "default" | "secondary" | "destructive" | "outline" {
  if (days == null) return "secondary";
  if (days <= 0) return "destructive";
  if (days <= 7) return "outline";
  if (days <= 30) return "default";
  return "secondary";
}

function MasterRenovacoes() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("urgentes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [renewTarget, setRenewTarget] = useState<SubRow | null>(null);
  const [extendTarget, setExtendTarget] = useState<SubRow | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<SubRow | null>(null);
  const [months, setMonths] = useState("1");
  const [extendDays, setExtendDays] = useState("30");
  const [invoiceDue, setInvoiceDue] = useState("");
  const [createNextInvoice, setCreateNextInvoice] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["master", "subscriptions"],
    queryFn: async () => {
      const res = await masterService.listSubscriptions();
      if (res.error) throw res.error;
      return (res.data ?? []) as SubRow[];
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ["master", "payments"],
    queryFn: async () => {
      const res = await masterService.listPayments();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    staleTime: 30_000,
  });

  const pendingByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of paymentsQuery.data ?? []) {
      if ((p as { status?: string }).status !== "pending") continue;
      const companyId = String((p as { company_id?: string }).company_id ?? "");
      if (!companyId) continue;
      map.set(companyId, (map.get(companyId) ?? 0) + 1);
    }
    return map;
  }, [paymentsQuery.data]);

  const enriched = useMemo(() => {
    return (data ?? [])
      .map((s) => ({
        ...s,
        days: daysUntil(s.current_period_end),
        pendingCount: pendingByCompany.get(String(s.company_id ?? "")) ?? 0,
      }))
      .sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999));
  }, [data, pendingByCompany]);

  const stats = useMemo(() => {
    const open = enriched.filter((s) => s.status !== "canceled");
    const overdue = open.filter((s) => (s.days ?? 999) < 0 || s.status === "past_due");
    const next7 = open.filter((s) => {
      const d = s.days;
      return d != null && d >= 0 && d <= 7;
    });
    const next30 = open.filter((s) => {
      const d = s.days;
      return d != null && d >= 0 && d <= 30;
    });
    const trial = open.filter((s) => s.status === "trialing");
    const riskIds = new Set<string>();
    for (const s of overdue) riskIds.add(s.id);
    for (const s of next7) riskIds.add(s.id);
    const riskRevenue = enriched
      .filter((s) => riskIds.has(s.id))
      .reduce((acc, s) => {
        const price = Number(s.plans?.price ?? 0);
        return acc + (Number.isNaN(price) ? 0 : price);
      }, 0);
    return {
      overdue: overdue.length,
      next7: next7.length,
      next30: next30.length,
      trial: trial.length,
      riskRevenue,
      total: open.length,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...enriched];

    if (tab === "urgentes") {
      rows = rows.filter(
        (s) =>
          s.status !== "canceled" &&
          (s.status === "past_due" || (s.days != null && s.days <= 7)),
      );
    } else if (tab === "30dias") {
      rows = rows.filter(
        (s) => s.status !== "canceled" && s.days != null && s.days >= 0 && s.days <= 30,
      );
    } else if (tab === "trial") {
      rows = rows.filter((s) => s.status === "trialing");
    }

    if (statusFilter !== "all") {
      rows = rows.filter((s) => s.status === statusFilter);
    }

    if (q) {
      rows = rows.filter((s) => {
        const name = String(s.companies?.name ?? "").toLowerCase();
        const slug = String(s.companies?.slug ?? "").toLowerCase();
        const plan = String(s.plans?.name ?? "").toLowerCase();
        return name.includes(q) || slug.includes(q) || plan.includes(q);
      });
    }

    return rows;
  }, [enriched, tab, search, statusFilter]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "notification_feed"] });
  };

  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!renewTarget?.company_id) throw new Error("Assinatura sem empresa.");
      const monthsN = Number(months);
      if (Number.isNaN(monthsN) || monthsN < 1 || monthsN > 24) {
        throw new Error("Meses inválidos.");
      }
      const amount = Number(renewTarget.plans?.price ?? 0);
      if (Number.isNaN(amount) || amount < 0) throw new Error("Valor do plano inválido.");

      const created = await masterService.createPayment({
        company_id: renewTarget.company_id,
        tenant_subscription_id: renewTarget.id,
        amount,
        status: "pending",
        payment_method: "manual",
        due_date: new Date().toISOString().slice(0, 10),
        paid_at: null,
      });
      if (created.error) throw created.error;

      const applied = await masterService.applyPaymentAndRenewV2({
        payment_id: created.data.id,
        months: monthsN,
        allow_canceled: true,
        create_next_invoice: createNextInvoice,
      });
      if (applied.error) throw applied.error;
      return applied.data;
    },
    onSuccess: async (payload: any) => {
      const name = renewTarget?.companies?.name ?? "Empresa";
      setRenewTarget(null);
      setMonths("1");
      setCreateNextInvoice(false);
      await invalidate();
      const end = payload?.new_period_end
        ? new Date(payload.new_period_end).toLocaleDateString("pt-BR")
        : null;
      toast.success(`${name}: renovação aplicada`, {
        description: end ? `Nova validade até ${end}.` : "Assinatura renovada com sucesso.",
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível renovar", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const extendMutation = useMutation({
    mutationFn: async () => {
      if (!extendTarget) throw new Error("Selecione uma assinatura.");
      const daysN = Number(extendDays);
      if (Number.isNaN(daysN) || daysN < 1 || daysN > 365) {
        throw new Error("Informe entre 1 e 365 dias.");
      }
      const base = extendTarget.current_period_end
        ? new Date(extendTarget.current_period_end)
        : new Date();
      if (base.getTime() < Date.now()) base.setTime(Date.now());
      base.setDate(base.getDate() + daysN);
      const res = await masterService.updateSubscription(extendTarget.id, {
        status: extendTarget.status === "canceled" ? "active" : extendTarget.status === "past_due" ? "active" : extendTarget.status ?? "active",
        current_period_end: base.toISOString(),
      });
      if (res.error) throw res.error;
      return { end: base, data: res.data };
    },
    onSuccess: async (payload) => {
      const name = extendTarget?.companies?.name ?? "Empresa";
      setExtendTarget(null);
      setExtendDays("30");
      await invalidate();
      toast.success(`${name}: prazo estendido`, {
        description: `Nova data: ${payload.end.toLocaleDateString("pt-BR")}.`,
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível estender", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceTarget) throw new Error("Selecione uma assinatura.");
      const res = await masterService.createPendingInvoice({
        subscription_id: invoiceTarget.id,
        due_date: invoiceDue ? invoiceDue : null,
      });
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean; error?: string; payment_id?: string } | null;
      if (payload && payload.ok === false) {
        throw new Error(payload.error ?? "Falha ao gerar cobrança.");
      }
      return payload;
    },
    onSuccess: async () => {
      const name = invoiceTarget?.companies?.name ?? "Empresa";
      setInvoiceTarget(null);
      setInvoiceDue("");
      await invalidate();
      toast.success("Cobrança pendente gerada", {
        description: `${name} aparece em Pagamentos → A receber.`,
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível gerar cobrança", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "urgentes", label: "Urgentes", count: stats.overdue + stats.next7 },
    { key: "30dias", label: "Próx. 30 dias", count: stats.next30 },
    { key: "trial", label: "Em teste", count: stats.trial },
    { key: "todas", label: "Todas", count: enriched.length },
  ];

  return (
    <div>
      <MasterPageTitle
        title="Renovações"
        subtitle="Priorize vencidas e próximas — renove, estenda ou gere cobrança em um clique."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </Button>
            <Button asChild className="rounded-full bg-foreground text-background hover:opacity-90">
              <Link to="/master/pagamentos">Ir para pagamentos</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={AlertTriangle}
          label="Vencidas / atraso"
          value={String(stats.overdue)}
          hint={moneyBRL(stats.riskRevenue)}
          detail="risco imediato"
          tone={stats.overdue > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={Clock3}
          label="Próximos 7 dias"
          value={String(stats.next7)}
          hint="renovação iminente"
          detail="acompanhar de perto"
          tone={stats.next7 > 0 ? "warn" : "default"}
        />
        <StatCard
          icon={CalendarClock}
          label="Próximos 30 dias"
          value={String(stats.next30)}
          hint="pipeline do mês"
          detail="planejar cobranças"
          tone="default"
        />
        <StatCard
          icon={Sparkles}
          label="Em teste (trial)"
          value={String(stats.trial)}
          hint="converter antes do fim"
          detail="acompanhar onboarding"
          tone={stats.trial > 0 ? "ok" : "default"}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  tab === t.key
                    ? "bg-foreground text-background"
                    : "border border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t.label}
                <span className="ml-1.5 opacity-70">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa, slug ou plano…"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trialing">Teste</SelectItem>
                <SelectItem value="past_due">Em atraso</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="canceled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {tab === "urgentes"
              ? "Vencidas, em atraso ou que renovam em até 7 dias — trate primeiro."
              : tab === "30dias"
                ? "Assinaturas com renovação nos próximos 30 dias."
                : tab === "trial"
                  ? "Empresas ainda no período de teste."
                  : "Todas as assinaturas, ordenadas pela data de renovação."}
          </p>
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar as renovações.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Validade</th>
                <th className="px-5 py-3">Prazo</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={6} />
                ))}

              {!isLoading &&
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{r.companies?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.companies?.slug ?? ""}
                        {r.pendingCount > 0 ? (
                          <span className="ml-1 text-amber-700 dark:text-amber-400">
                            · {r.pendingCount} cobrança(s) aberta(s)
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      <div>{r.plans?.name ?? "—"}</div>
                      <div className="text-[11px]">{moneyBRL(r.plans?.price)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(r.current_period_end)}</td>
                    <td className="px-5 py-4">
                      <Badge variant={urgencyVariant(r.days)}>{urgencyLabel(r.days)}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            setMonths("1");
                            setCreateNextInvoice(false);
                            setRenewTarget(r);
                          }}
                          disabled={renewMutation.isPending}
                        >
                          <RefreshCw className="mr-1 size-3.5" />
                          Renovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setExtendDays("30");
                            setExtendTarget(r);
                          }}
                          disabled={extendMutation.isPending}
                        >
                          Estender
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setInvoiceDue("");
                            setInvoiceTarget(r);
                          }}
                          disabled={invoiceMutation.isPending}
                        >
                          Cobrança
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={6}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={CheckCircle2}
                        title={
                          tab === "urgentes"
                            ? "Nenhuma renovação urgente"
                            : search || statusFilter !== "all"
                              ? "Nenhum resultado para este filtro"
                              : "Sem assinaturas para exibir"
                        }
                        description={
                          tab === "urgentes"
                            ? "Quando houver vencidas ou renovação em até 7 dias, elas aparecem aqui."
                            : "Ajuste a busca/status ou veja a aba Todas."
                        }
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renovar com pagamento */}
      <Dialog open={Boolean(renewTarget)} onOpenChange={(v) => !v && setRenewTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar assinatura</DialogTitle>
            <DialogDescription>
              {renewTarget?.companies?.name ?? "Empresa"} · {renewTarget?.plans?.name ?? "Plano"} ·{" "}
              {moneyBRL(renewTarget?.plans?.price)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Validade atual:{" "}
              <span className="text-foreground">{formatDate(renewTarget?.current_period_end)}</span>
              {" · "}
              {urgencyLabel(daysUntil(renewTarget?.current_period_end))}
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Renovar por</span>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, idx) => {
                    const m = String(idx + 1);
                    return (
                      <SelectItem key={m} value={m}>
                        {idx + 1} mês(es)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </label>
            <ToggleRow
              label="Gerar próxima cobrança pendente"
              hint="Normalmente deixe desligado — só confirma o pagamento desta renovação."
              checked={createNextInvoice}
              onChange={setCreateNextInvoice}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewTarget(null)} disabled={renewMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending}>
              {renewMutation.isPending ? "Renovando…" : "Confirmar renovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estender prazo sem cobrança */}
      <Dialog open={Boolean(extendTarget)} onOpenChange={(v) => !v && setExtendTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estender validade</DialogTitle>
            <DialogDescription>
              {extendTarget?.companies?.name ?? "Empresa"} — sem gerar pagamento (cortesia / ajuste).
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Adicionar dias</span>
            <Select value={extendDays} onValueChange={setExtendDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["7", "15", "30", "60", "90"].map((d) => (
                  <SelectItem key={d} value={d}>
                    +{d} dias
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)} disabled={extendMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => extendMutation.mutate()} disabled={extendMutation.isPending}>
              {extendMutation.isPending ? "Salvando…" : "Estender prazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerar cobrança pendente */}
      <Dialog open={Boolean(invoiceTarget)} onOpenChange={(v) => !v && setInvoiceTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar cobrança pendente</DialogTitle>
            <DialogDescription>
              Cria uma fatura em aberto para {invoiceTarget?.companies?.name ?? "a empresa"} (sem marcar como pago).
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Vencimento (opcional)</span>
            <Input type="date" value={invoiceDue} onChange={(e) => setInvoiceDue(e.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceTarget(null)} disabled={invoiceMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
              {invoiceMutation.isPending ? "Gerando…" : "Gerar cobrança"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
      <span>
        <span className="block font-medium text-foreground">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-foreground" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-background transition ${checked ? "left-5" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  detail,
  tone,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  hint: string;
  detail: string;
  tone: "default" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/25 bg-amber-500/5"
        : tone === "danger"
          ? "border-destructive/25 bg-destructive/5"
          : "border-border bg-card";

  return (
    <div className={`rounded-2xl border p-4 shadow-soft ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{value}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{hint}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}
