import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Wallet } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/pagamentos")({
  component: MasterPagamentos,
});

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    failed: "Falhou",
    refunded: "Reembolsado",
  };
  return map[status] ?? status;
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" {
  if (status === "paid") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

function moneyBRL(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MasterPagamentos() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: "",
    subscriptionId: "",
    amount: "",
    dueDate: "",
    paymentMethod: "manual",
    months: "1",
    allowCanceled: false,
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "payments"],
    queryFn: async () => {
      const res = await masterService.listPayments();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const months = Number(form.months);
      if (!form.companyId || !form.subscriptionId || Number.isNaN(amount)) {
        throw new Error("Dados inválidos");
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

      // Padroniza: aplica pagamento via RPC (renova assinatura e gera próxima cobrança)
      const applied = await masterService.applyPaymentAndRenewV2({
        payment_id: res.data.id,
        months,
        allow_canceled: form.allowCanceled,
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
        allowCanceled: false,
      });
      await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "notification_feed"] });

      const newEnd = payload?.new_period_end ? new Date(payload.new_period_end).toLocaleDateString("pt-BR") : null;
      toast.success("Pagamento registrado e renovação aplicada", {
        description: newEnd ? `Nova renovação: ${newEnd}` : "Renovação aplicada com sucesso.",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await masterService.applyPaymentAndRenewV2({ payment_id: paymentId, months: 1, allow_canceled: false });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async (payload: any) => {
      await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "notification_feed"] });
      const newEnd = payload?.new_period_end ? new Date(payload.new_period_end).toLocaleDateString("pt-BR") : null;
      toast.success("Pagamento aplicado", {
        description: newEnd ? `Nova renovação: ${newEnd}` : "Renovação aplicada com sucesso.",
      });
    },
  });

  return (
    <div>
      <MasterPageTitle
        title="Pagamentos"
        subtitle="Histórico e status de cobranças."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-foreground text-background hover:opacity-90" onClick={() => setOpen(true)}>
                Registrar pagamento
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Registrar pagamento manual</DialogTitle>
                <DialogDescription>
                  Crie um pagamento “Pago” para uma empresa (uso interno).
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
                      <SelectValue placeholder={form.companyId ? "Selecione a assinatura" : "Selecione a empresa primeiro"} />
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
                  <span className="text-[11px] text-muted-foreground">
                    Obrigatório para renovar o período automaticamente.
                  </span>
                </label>

                <label className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <span>Permitir renovar assinatura cancelada</span>
                  <button
                    type="button"
                    onClick={() => setForm((s) => ({ ...s, allowCanceled: !s.allowCanceled }))}
                    className={`relative h-6 w-11 rounded-full transition ${form.allowCanceled ? "bg-foreground" : "bg-muted"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-background transition ${form.allowCanceled ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </label>

                <div className="grid gap-3 md:grid-cols-2">
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
                    <span className="text-xs font-medium text-muted-foreground">Vencimento (opcional)</span>
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Valor</span>
                    <Input value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} placeholder="79" />
                  </label>
                  <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    {(() => {
                      const sub = (subsQuery.data ?? []).find((s: any) => s.id === form.subscriptionId);
                      const company = (companiesQuery.data ?? []).find((c: any) => c.id === form.companyId);
                      if (!sub || !company) return "Selecione empresa e assinatura para ver o resumo.";
                      const end = sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString("pt-BR")
                        : "—";
                      const plan = sub.plans?.name ?? "Plano";
                      return `${company.name} · ${plan} · Renovação atual: ${end}`;
                    })()}
                  </div>
                </div>

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Método (texto livre)</span>
                  <Input value={form.paymentMethod} onChange={(e) => setForm((s) => ({ ...s, paymentMethod: e.target.value }))} />
                </label>
              </div>

              {createPaymentMutation.error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Não foi possível registrar. Verifique empresa, assinatura e valor. Se a assinatura estiver cancelada, habilite “Permitir renovar assinatura cancelada”.
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={createPaymentMutation.isPending}>
                  Cancelar
                </Button>
                <Button onClick={() => createPaymentMutation.mutate()} disabled={createPaymentMutation.isPending}>
                  {createPaymentMutation.isPending ? "Registrando…" : "Registrar e renovar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${data?.length ?? 0} pagamento(s)`}
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar os pagamentos.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Pago em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={6} />
                ))}
              {!isLoading &&
                (data ?? []).map((p: any) => (
                <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{p.companies?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.companies?.slug ?? ""}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{moneyBRL(p.amount)}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant(p.status)}>{statusLabel(p.status)}</Badge>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {p.status !== "paid" ? (
                      <Button
                        size="sm"
                        onClick={() => markPaidMutation.mutate(p.id)}
                        disabled={markPaidMutation.isPending}
                      >
                        Marcar como pago
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-0" colSpan={6}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={Wallet}
                        title="Nenhum pagamento registrado"
                        description="O histórico de cobranças aparece aqui. Você pode registrar um pagamento manual quando a empresa pagar fora do Mercado Pago."
                        action={
                          <Button
                            className="rounded-full bg-foreground text-background hover:opacity-90"
                            onClick={() => setOpen(true)}
                          >
                            Registrar pagamento
                          </Button>
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
    </div>
  );
}

