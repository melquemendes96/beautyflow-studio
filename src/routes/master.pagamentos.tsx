import { createFileRoute } from "@tanstack/react-router";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Search, Trash2, Wallet, XCircle } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/pagamentos")({
  component: MasterPagamentos,
});

type PaymentRow = {
  id: string;
  company_id?: string;
  amount?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  payment_method?: string | null;
  gateway_provider?: string | null;
  companies?: { name?: string | null; slug?: string | null } | null;
  tenant_subscriptions?: {
    status?: string | null;
    current_period_end?: string | null;
    plan_id?: string | null;
  } | null;
};

type TabKey = "receber" | "pagas" | "todas";

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    failed: "Falhou",
    refunded: "Reembolsado",
    active: "Ativa",
    trialing: "Trial",
    past_due: "Em atraso",
    canceled: "Cancelada",
  };
  return map[status] ?? status;
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid" || status === "active") return "default";
  if (status === "failed" || status === "canceled" || status === "past_due") return "destructive";
  if (status === "pending") return "outline";
  return "secondary";
}

function moneyBRL(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function isOverdue(p: PaymentRow): boolean {
  if (p.status !== "pending" || !p.due_date) return false;
  const due = new Date(`${p.due_date}T23:59:59`);
  return due.getTime() < Date.now();
}

function startOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function MasterPagamentos() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("receber");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [confirmPay, setConfirmPay] = useState<PaymentRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentRow | null>(null);
  const [markMonths, setMarkMonths] = useState("1");
  const [createNextInvoice, setCreateNextInvoice] = useState(false);
  const [form, setForm] = useState({
    companyId: "",
    subscriptionId: "",
    amount: "",
    dueDate: "",
    paymentMethod: "manual",
    months: "1",
    allowCanceled: true,
    createNextInvoice: false,
  });

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

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["master", "payments"],
    queryFn: async () => {
      const res = await masterService.listPayments();
      if (res.error) throw res.error;
      return (res.data ?? []) as PaymentRow[];
    },
  });

  const invalidateBilling = async () => {
    await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "notification_feed"] });
  };

  const stats = useMemo(() => {
    const rows = data ?? [];
    const pending = rows.filter((p) => p.status === "pending");
    const overdue = pending.filter(isOverdue);
    const monthStart = startOfMonthIso();
    const paidMonth = rows.filter(
      (p) => p.status === "paid" && p.paid_at && String(p.paid_at).slice(0, 10) >= monthStart,
    );
    const paidMonthTotal = paidMonth.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    const pendingTotal = pending.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    return {
      pendingCount: pending.length,
      overdueCount: overdue.length,
      pendingTotal,
      paidMonthCount: paidMonth.length,
      paidMonthTotal,
      failedCount: rows.filter((p) => p.status === "failed").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...(data ?? [])];

    if (tab === "receber") rows = rows.filter((p) => p.status === "pending");
    else if (tab === "pagas") rows = rows.filter((p) => p.status === "paid");

    if (companyFilter !== "all") {
      rows = rows.filter((p) => p.company_id === companyFilter);
    }

    if (q) {
      rows = rows.filter((p) => {
        const name = String(p.companies?.name ?? "").toLowerCase();
        const slug = String(p.companies?.slug ?? "").toLowerCase();
        return name.includes(q) || slug.includes(q);
      });
    }

    rows.sort((a, b) => {
      if (tab === "receber" || (tab === "todas" && a.status === "pending" && b.status !== "pending")) {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
      }
      if (tab === "receber") {
        const ad = a.due_date ?? "9999-99-99";
        const bd = b.due_date ?? "9999-99-99";
        if (ad !== bd) return ad.localeCompare(bd);
      }
      if (tab === "pagas") {
        return String(b.paid_at ?? "").localeCompare(String(a.paid_at ?? ""));
      }
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });

    return rows;
  }, [data, tab, search, companyFilter]);

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const months = Number(form.months);
      if (!form.companyId || !form.subscriptionId || Number.isNaN(amount)) {
        throw new Error("Preencha empresa, assinatura e valor.");
      }
      if (Number.isNaN(months) || months < 1 || months > 24) {
        throw new Error("Meses inválidos");
      }

      const res = await masterService.createPayment({
        company_id: form.companyId,
        tenant_subscription_id: form.subscriptionId,
        amount,
        status: "pending",
        payment_method: form.paymentMethod || null,
        due_date: form.dueDate ? form.dueDate : null,
        paid_at: null,
      });
      if (res.error) throw res.error;

      const applied = await masterService.applyPaymentAndRenewV2({
        payment_id: res.data.id,
        months,
        allow_canceled: form.allowCanceled,
        create_next_invoice: form.createNextInvoice,
      });
      if (applied.error) throw applied.error;
      return applied.data;
    },
    onSuccess: async (payload: any) => {
      setOpen(false);
      setForm({
        companyId: "",
        subscriptionId: "",
        amount: "",
        dueDate: "",
        paymentMethod: "manual",
        months: "1",
        allowCanceled: true,
        createNextInvoice: false,
      });
      setTab("pagas");
      await invalidateBilling();
      const newEnd = payload?.new_period_end
        ? new Date(payload.new_period_end).toLocaleDateString("pt-BR")
        : null;
      toast.success("Pagamento registrado", {
        description: newEnd
          ? `Assinatura renovada até ${newEnd}.`
          : "Cobrança marcada como paga e assinatura renovada.",
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível registrar o pagamento", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!confirmPay) throw new Error("Selecione um pagamento.");
      const months = Number(markMonths);
      if (Number.isNaN(months) || months < 1 || months > 24) {
        throw new Error("Meses inválidos");
      }
      const res = await masterService.applyPaymentAndRenewV2({
        payment_id: confirmPay.id,
        months,
        allow_canceled: true,
        create_next_invoice: createNextInvoice,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async (payload: any) => {
      const companyName = confirmPay?.companies?.name ?? "Empresa";
      const createdNext = Boolean(payload?.created_next_invoice);
      setConfirmPay(null);
      setMarkMonths("1");
      setCreateNextInvoice(false);
      setTab(createdNext ? "receber" : "pagas");
      await invalidateBilling();
      const newEnd = payload?.new_period_end
        ? new Date(payload.new_period_end).toLocaleDateString("pt-BR")
        : null;
      toast.success(`${companyName}: pagamento confirmado`, {
        description: newEnd
          ? `Renovada até ${newEnd}${createdNext ? ". Próxima cobrança gerada em A receber." : "."}`
          : "Assinatura renovada.",
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível marcar como pago", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) throw new Error("Selecione uma cobrança.");
      const res = await masterService.deletePendingPayment(confirmDelete.id);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      const name = confirmDelete?.companies?.name ?? "Cobrança";
      setConfirmDelete(null);
      await invalidateBilling();
      toast.success("Cobrança removida", {
        description: `${name} foi excluída da lista de pendentes.`,
      });
    },
    onError: (err: any) => {
      toast.error("Não foi possível excluir", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "receber", label: "A receber", count: stats.pendingCount },
    { key: "pagas", label: "Pagas", count: (data ?? []).filter((p) => p.status === "paid").length },
    { key: "todas", label: "Todas", count: data?.length ?? 0 },
  ];

  return (
    <div>
      <MasterPageTitle
        title="Pagamentos"
        subtitle="Confirme recebimentos manuais e acompanhe cobranças por empresa."
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
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full bg-foreground text-background hover:opacity-90">
                  Registrar pagamento
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Registrar pagamento manual</DialogTitle>
                  <DialogDescription>
                    Marca a cobrança como paga e renova a assinatura. Use quando o cliente pagou fora do Mercado Pago.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Empresa</span>
                    <Select
                      value={form.companyId}
                      onValueChange={(v) =>
                        setForm((s) => ({ ...s, companyId: v, subscriptionId: "", amount: "" }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {(companiesQuery.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} · {c.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Assinatura</span>
                    <Select
                      value={form.subscriptionId}
                      onValueChange={(v) => {
                        const sub = (subsQuery.data ?? []).find((s: any) => s.id === v);
                        setForm((s) => ({
                          ...s,
                          subscriptionId: v,
                          amount: sub?.plans?.price != null ? String(sub.plans.price) : s.amount,
                        }));
                      }}
                      disabled={!form.companyId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={form.companyId ? "Selecione a assinatura" : "Selecione a empresa primeiro"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(subsQuery.data ?? [])
                          .filter((s: any) => s.company_id === form.companyId)
                          .map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.plans?.name ?? "Plano"} · {statusLabel(s.status)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Renovar por</span>
                      <Select value={form.months} onValueChange={(v) => setForm((s) => ({ ...s, months: v }))}>
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
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Valor</span>
                      <Input
                        value={form.amount}
                        onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                        placeholder="49.90"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Vencimento (opcional)</span>
                      <Input
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Método</span>
                      <Input
                        value={form.paymentMethod}
                        onChange={(e) => setForm((s) => ({ ...s, paymentMethod: e.target.value }))}
                        placeholder="PIX, transferência…"
                      />
                    </label>
                  </div>

                  <ToggleRow
                    label="Permitir renovar assinatura cancelada"
                    checked={form.allowCanceled}
                    onChange={(v) => setForm((s) => ({ ...s, allowCanceled: v }))}
                  />
                  <ToggleRow
                    label="Gerar próxima cobrança pendente"
                    hint="Deixe desligado para só confirmar este pagamento sem criar outra fatura."
                    checked={form.createNextInvoice}
                    onChange={(v) => setForm((s) => ({ ...s, createNextInvoice: v }))}
                  />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={createPaymentMutation.isPending}>
                    Cancelar
                  </Button>
                  <Button onClick={() => createPaymentMutation.mutate()} disabled={createPaymentMutation.isPending}>
                    {createPaymentMutation.isPending ? "Registrando…" : "Confirmar pagamento"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Clock3}
          label="A receber"
          value={String(stats.pendingCount)}
          hint={moneyBRL(stats.pendingTotal)}
          tone={stats.overdueCount > 0 ? "warn" : "default"}
          detail={stats.overdueCount > 0 ? `${stats.overdueCount} vencida(s)` : "em aberto"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Pagas no mês"
          value={String(stats.paidMonthCount)}
          hint={moneyBRL(stats.paidMonthTotal)}
          tone="ok"
          detail="confirmadas"
        />
        <StatCard
          icon={XCircle}
          label="Falharam"
          value={String(stats.failedCount)}
          hint="revisar se preciso"
          tone={stats.failedCount > 0 ? "danger" : "default"}
          detail="status failed"
        />
        <StatCard
          icon={Wallet}
          label="Total na lista"
          value={String(data?.length ?? 0)}
          hint="histórico completo"
          tone="default"
          detail="todos os registros"
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
                placeholder="Buscar empresa ou slug…"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Todas as empresas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {(companiesQuery.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {tab === "receber"
              ? "Só cobranças pendentes. Confirmar pagamento renova a assinatura sem criar outra fatura (a menos que você peça)."
              : tab === "pagas"
                ? "Histórico de pagamentos confirmados."
                : "Lista completa. Use a busca para achar uma empresa."}
          </p>
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar os pagamentos. Atualize a página ou verifique a sessão master.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Pago em</th>
                <th className="px-5 py-3">Assinatura</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => <AdminTableRowSkeleton key={`sk-${i}`} cols={7} />)}

              {!isLoading &&
                filtered.map((p) => {
                  const overdue = isOverdue(p);
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">{p.companies?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.companies?.slug ?? ""}
                          {p.payment_method ? ` · ${p.payment_method}` : ""}
                          {p.gateway_provider && p.gateway_provider !== "manual"
                            ? ` · ${p.gateway_provider}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-medium text-foreground">{moneyBRL(p.amount)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={statusVariant(p.status)}>{statusLabel(p.status)}</Badge>
                          {overdue ? <Badge variant="destructive">Vencida</Badge> : null}
                        </div>
                      </td>
                      <td className={`px-5 py-4 ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {formatDate(p.due_date)}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{formatDate(p.paid_at)}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <div>{statusLabel(p.tenant_subscriptions?.status)}</div>
                        <div className="text-[11px]">
                          até {formatDate(p.tenant_subscriptions?.current_period_end)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          {p.status !== "paid" ? (
                            <>
                              <Button
                                size="sm"
                                className="rounded-full"
                                onClick={() => {
                                  setMarkMonths("1");
                                  setCreateNextInvoice(false);
                                  setConfirmPay(p);
                                }}
                                disabled={markPaidMutation.isPending || deleteMutation.isPending}
                              >
                                Marcar pago
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => setConfirmDelete(p)}
                                disabled={markPaidMutation.isPending || deleteMutation.isPending}
                                aria-label="Excluir cobrança"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Confirmado</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={7}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={Wallet}
                        title={
                          tab === "receber"
                            ? "Nada a receber"
                            : tab === "pagas"
                              ? "Nenhum pagamento confirmado neste filtro"
                              : "Nenhum pagamento encontrado"
                        }
                        description={
                          search || companyFilter !== "all"
                            ? "Ajuste a busca ou o filtro de empresa."
                            : "Registre um pagamento manual quando a empresa pagar fora do Mercado Pago."
                        }
                        action={
                          tab === "receber" ? (
                            <Button
                              className="rounded-full bg-foreground text-background hover:opacity-90"
                              onClick={() => setOpen(true)}
                            >
                              Registrar pagamento
                            </Button>
                          ) : undefined
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

      {/* Confirmar marcar como pago */}
      <Dialog
        open={Boolean(confirmPay)}
        onOpenChange={(v) => {
          if (!v) setConfirmPay(null);
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
            <DialogDescription>
              {confirmPay?.companies?.name ?? "Empresa"} · {moneyBRL(confirmPay?.amount)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Vencimento: <span className="text-foreground">{formatDate(confirmPay?.due_date)}</span>
              {" · "}
              Assinatura:{" "}
              <span className="text-foreground">{statusLabel(confirmPay?.tenant_subscriptions?.status)}</span>
            </div>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Renovar assinatura por</span>
              <Select value={markMonths} onValueChange={setMarkMonths}>
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
              hint="Só ligue se quiser já criar a fatura do próximo ciclo na lista."
              checked={createNextInvoice}
              onChange={setCreateNextInvoice}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPay(null)} disabled={markPaidMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending}>
              {markPaidMutation.isPending ? "Confirmando…" : "Confirmar como pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir pendente */}
      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null);
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir cobrança?</DialogTitle>
            <DialogDescription>
              Remove {confirmDelete?.companies?.name ?? "esta cobrança"} ({moneyBRL(confirmDelete?.amount)}) da lista.
              Não altera a assinatura — só limpa pendentes duplicados ou errados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir cobrança"}
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
  icon: typeof Wallet;
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
