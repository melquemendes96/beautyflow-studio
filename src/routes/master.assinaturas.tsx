import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  Repeat,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/assinaturas")({
  component: MasterAssinaturas,
});

type SubRow = {
  id: string;
  company_id?: string;
  plan_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
  current_period_start?: string | null;
  companies?: { name?: string | null; slug?: string | null } | null;
  plans?: { name?: string | null; price?: number | string | null } | null;
};

type TabKey = "ativas" | "teste" | "risco" | "inativas" | "todas";
type ConfirmAction = "pause" | "activate" | "cancel" | null;

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

function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const end = new Date(dateIso);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days: number | null): string {
  if (days == null) return "Sem data";
  if (days < 0) return `Vencida há ${Math.abs(days)}d`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Amanhã";
  return `${days}d`;
}

function MasterAssinaturas() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("ativas");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const [editing, setEditing] = useState<SubRow | null>(null);
  const [periodEnd, setPeriodEnd] = useState("");
  const [editPlanId, setEditPlanId] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  const [invoiceTarget, setInvoiceTarget] = useState<SubRow | null>(null);
  const [invoiceDue, setInvoiceDue] = useState("");

  const [renewTarget, setRenewTarget] = useState<SubRow | null>(null);
  const [months, setMonths] = useState("1");
  const [createNextInvoice, setCreateNextInvoice] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<SubRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["master", "subscriptions"],
    queryFn: async () => {
      const res = await masterService.listSubscriptions();
      if (res.error) throw res.error;
      return (res.data ?? []) as SubRow[];
    },
  });

  const plansQuery = useQuery({
    queryKey: ["master", "plans"],
    queryFn: async () => {
      const res = await masterService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
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
      const id = String((p as { company_id?: string }).company_id ?? "");
      if (!id) continue;
      map.set(id, (map.get(id) ?? 0) + 1);
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
      .sort((a, b) => {
        const order = (st?: string | null) => {
          if (st === "past_due") return 0;
          if (st === "trialing") return 1;
          if (st === "active") return 2;
          if (st === "paused") return 3;
          return 4;
        };
        const oa = order(a.status);
        const ob = order(b.status);
        if (oa !== ob) return oa - ob;
        return (a.days ?? 999999) - (b.days ?? 999999);
      });
  }, [data, pendingByCompany]);

  const stats = useMemo(() => {
    const active = enriched.filter((s) => s.status === "active").length;
    const trial = enriched.filter((s) => s.status === "trialing").length;
    const risk = enriched.filter(
      (s) => s.status === "past_due" || (s.days != null && s.days <= 7 && s.status !== "canceled"),
    ).length;
    const inactive = enriched.filter((s) => s.status === "paused" || s.status === "canceled").length;
    const mrr = enriched
      .filter((s) => s.status === "active" || s.status === "trialing")
      .reduce((acc, s) => acc + (Number(s.plans?.price) || 0), 0);
    return { active, trial, risk, inactive, mrr, total: enriched.length };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...enriched];

    if (tab === "ativas") rows = rows.filter((s) => s.status === "active");
    else if (tab === "teste") rows = rows.filter((s) => s.status === "trialing");
    else if (tab === "risco") {
      rows = rows.filter(
        (s) =>
          s.status === "past_due" ||
          s.status === "trial_expired" ||
          (s.days != null && s.days <= 7 && s.status !== "canceled" && s.status !== "paused"),
      );
    } else if (tab === "inativas") {
      rows = rows.filter((s) => s.status === "paused" || s.status === "canceled");
    }

    if (planFilter !== "all") {
      rows = rows.filter((s) => s.plan_id === planFilter);
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
  }, [enriched, tab, search, planFilter]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "notification_feed"] });
  };

  const updateMutation = useMutation({
    mutationFn: async (input: { subscriptionId: string; patch: Record<string, unknown>; successMsg: string }) => {
      const res = await masterService.updateSubscription(input.subscriptionId, input.patch);
      if (res.error) throw res.error;
      return input.successMsg;
    },
    onSuccess: async (msg) => {
      await invalidate();
      toast.success(msg);
      setEditing(null);
      setConfirmTarget(null);
      setConfirmAction(null);
    },
    onError: (err: any) => {
      toast.error("Não foi possível atualizar", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceTarget?.id) throw new Error("Sem assinatura");
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

  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!renewTarget?.company_id) throw new Error("Assinatura sem empresa.");
      const monthsN = Number(months);
      if (Number.isNaN(monthsN) || monthsN < 1 || monthsN > 24) throw new Error("Meses inválidos.");
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
      toast.success(`${name}: renovada`, {
        description: end ? `Validade até ${end}.` : "Assinatura renovada.",
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível renovar", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const beginEdit = (s: SubRow) => {
    setEditing(s);
    setEditPlanId(s.plan_id ?? "");
    setEditStatus(s.status ?? "active");
    setPeriodEnd(s.current_period_end ? new Date(s.current_period_end).toISOString().slice(0, 10) : "");
  };

  const saveEdit = () => {
    if (!editing) return;
    updateMutation.mutate({
      subscriptionId: editing.id,
      patch: {
        plan_id: editPlanId || undefined,
        status: editStatus,
        current_period_end: periodEnd ? new Date(`${periodEnd}T12:00:00`).toISOString() : null,
      },
      successMsg: `${editing.companies?.name ?? "Assinatura"} atualizada`,
    });
  };

  const runConfirm = () => {
    if (!confirmTarget || !confirmAction) return;
    const name = confirmTarget.companies?.name ?? "Assinatura";
    if (confirmAction === "pause") {
      updateMutation.mutate({
        subscriptionId: confirmTarget.id,
        patch: { status: "paused" },
        successMsg: `${name} pausada`,
      });
    } else if (confirmAction === "activate") {
      updateMutation.mutate({
        subscriptionId: confirmTarget.id,
        patch: { status: "active" },
        successMsg: `${name} reativada`,
      });
    } else if (confirmAction === "cancel") {
      updateMutation.mutate({
        subscriptionId: confirmTarget.id,
        patch: { status: "canceled" },
        successMsg: `${name} cancelada`,
      });
    }
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "ativas", label: "Ativas", count: stats.active },
    { key: "teste", label: "Em teste", count: stats.trial },
    { key: "risco", label: "Risco", count: stats.risk },
    { key: "inativas", label: "Inativas", count: stats.inactive },
    { key: "todas", label: "Todas", count: stats.total },
  ];

  const busy =
    updateMutation.isPending || invoiceMutation.isPending || renewMutation.isPending;

  return (
    <div>
      <MasterPageTitle
        title="Assinaturas"
        subtitle="Gerencie plano, status e validade de cada empresa."
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
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/master/renovacoes">Renovações</Link>
            </Button>
            <Button asChild className="rounded-full bg-foreground text-background hover:opacity-90">
              <Link to="/master/pagamentos">Pagamentos</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CheckCircle2}
          label="Ativas"
          value={String(stats.active)}
          hint={moneyBRL(stats.mrr)}
          detail="MRR aproximado (ativas + trial)"
          tone="ok"
        />
        <StatCard
          icon={Sparkles}
          label="Em teste"
          value={String(stats.trial)}
          hint="converter antes do fim"
          detail="onboarding"
          tone={stats.trial > 0 ? "warn" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Em risco"
          value={String(stats.risk)}
          hint="atraso ou ≤ 7 dias"
          detail="priorizar cobrança"
          tone={stats.risk > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={PauseCircle}
          label="Inativas"
          value={String(stats.inactive)}
          hint="pausadas ou canceladas"
          detail="podem reativar"
          tone="default"
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

          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa, slug ou plano…"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Todos os planos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos</SelectItem>
                {(plansQuery.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar as assinaturas.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[1040px] text-sm">
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
                filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{s.companies?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.companies?.slug ?? ""}
                        {s.pendingCount > 0 ? (
                          <span className="ml-1 text-amber-700 dark:text-amber-400">
                            · {s.pendingCount} cobrança(s)
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      <div>{s.plans?.name ?? "—"}</div>
                      <div className="text-[11px]">{moneyBRL(s.plans?.price)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={statusVariant(s.status)}>{statusLabel(s.status)}</Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(s.current_period_end)}</td>
                    <td className="px-5 py-4">
                      <Badge
                        variant={
                          s.days != null && s.days <= 0
                            ? "destructive"
                            : s.days != null && s.days <= 7
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {urgencyLabel(s.days)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={busy}
                          onClick={() => {
                            setMonths("1");
                            setCreateNextInvoice(false);
                            setRenewTarget(s);
                          }}
                        >
                          <RefreshCw className="mr-1 size-3.5" />
                          Renovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={busy}
                          onClick={() => beginEdit(s)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={busy}
                          onClick={() => {
                            setInvoiceDue("");
                            setInvoiceTarget(s);
                          }}
                        >
                          Cobrança
                        </Button>
                        {s.status === "paused" || s.status === "canceled" || s.status === "past_due" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full"
                            disabled={busy}
                            onClick={() => {
                              setConfirmTarget(s);
                              setConfirmAction("activate");
                            }}
                          >
                            Reativar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full"
                            disabled={busy}
                            onClick={() => {
                              setConfirmTarget(s);
                              setConfirmAction("pause");
                            }}
                          >
                            Pausar
                          </Button>
                        )}
                        {s.status !== "canceled" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-full"
                            disabled={busy}
                            onClick={() => {
                              setConfirmTarget(s);
                              setConfirmAction("cancel");
                            }}
                          >
                            <XCircle className="mr-1 size-3.5" />
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={6}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={Repeat}
                        title={
                          search || planFilter !== "all"
                            ? "Nenhum resultado para este filtro"
                            : tab === "ativas"
                              ? "Nenhuma assinatura ativa"
                              : "Nenhuma assinatura nesta aba"
                        }
                        description="Assinaturas aparecem após checkout ou cadastro com plano. Use Todas para ver o histórico completo."
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editar */}
      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar assinatura</DialogTitle>
            <DialogDescription>
              {editing?.companies?.name ?? "Empresa"} · ajuste plano, status e validade.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Plano</span>
              <Select value={editPlanId} onValueChange={setEditPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  {(plansQuery.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {moneyBRL(p.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trialing">Teste</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="past_due">Em atraso</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Fim do período</span>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>
              Fechar
            </Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending || !editPlanId}>
              {updateMutation.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cobrança */}
      <Dialog open={Boolean(invoiceTarget)} onOpenChange={(v) => !v && setInvoiceTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar cobrança pendente</DialogTitle>
            <DialogDescription>
              Cria fatura em aberto para {invoiceTarget?.companies?.name ?? "a empresa"} sem marcar como pago.
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

      {/* Renovar */}
      <Dialog open={Boolean(renewTarget)} onOpenChange={(v) => !v && setRenewTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar com pagamento</DialogTitle>
            <DialogDescription>
              {renewTarget?.companies?.name ?? "Empresa"} · {renewTarget?.plans?.name ?? "Plano"} ·{" "}
              {moneyBRL(renewTarget?.plans?.price)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Validade atual:{" "}
              <span className="text-foreground">{formatDate(renewTarget?.current_period_end)}</span>
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
              hint="Deixe desligado para só confirmar esta renovação."
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

      {/* Confirmar pausar / reativar / cancelar */}
      <Dialog
        open={Boolean(confirmTarget && confirmAction)}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmTarget(null);
            setConfirmAction(null);
          }
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "pause"
                ? "Pausar assinatura?"
                : confirmAction === "activate"
                  ? "Reativar assinatura?"
                  : "Cancelar assinatura?"}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.companies?.name ?? "Empresa"}
              {confirmAction === "cancel"
                ? " — a empresa deixa de ter acesso ativo. Você pode reativar depois."
                : confirmAction === "pause"
                  ? " — suspende o acesso sem apagar o histórico."
                  : " — volta o status para ativa."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmTarget(null);
                setConfirmAction(null);
              }}
              disabled={updateMutation.isPending}
            >
              Voltar
            </Button>
            <Button
              variant={confirmAction === "cancel" ? "destructive" : "default"}
              onClick={runConfirm}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? "Aplicando…"
                : confirmAction === "pause"
                  ? "Pausar"
                  : confirmAction === "activate"
                    ? "Reativar"
                    : "Cancelar assinatura"}
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
  icon: typeof Repeat;
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
