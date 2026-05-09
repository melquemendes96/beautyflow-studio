import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Repeat } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/assinaturas")({
  component: MasterAssinaturas,
});

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    trialing: "Teste",
    active: "Ativa",
    past_due: "Em atraso",
    canceled: "Cancelada",
    paused: "Pausada",
  };
  return map[status] ?? status;
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" {
  if (status === "active" || status === "trialing") return "default";
  if (status === "past_due") return "destructive";
  if (status === "canceled" || status === "paused") return "secondary";
  return "secondary";
}

function MasterAssinaturas() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [periodEnd, setPeriodEnd] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceDue, setInvoiceDue] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "subscriptions"],
    queryFn: async () => {
      const res = await masterService.listSubscriptions();
      if (res.error) throw res.error;
      return res.data ?? [];
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

  const updateSubscriptionMutation = useMutation({
    mutationFn: async (input: { subscriptionId: string; patch: any }) => {
      const res = await masterService.updateSubscription(input.subscriptionId, input.patch);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!editing?.id) throw new Error("Sem assinatura");
      const res = await masterService.createPendingInvoice({
        subscription_id: editing.id,
        due_date: invoiceDue ? invoiceDue : null,
      });
      if (res.error) throw res.error;
      return res.data as any;
    },
    onSuccess: async (payload: any) => {
      await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
      toast.success("Cobrança pendente gerada", {
        description: payload?.payment_id ? `Pagamento: ${payload.payment_id}` : "Cobrança criada com sucesso.",
      });
      setInvoiceOpen(false);
      setInvoiceDue("");
    },
  });

  const beginEdit = (s: any) => {
    setEditing(s);
    setPeriodEnd(s.current_period_end ? new Date(s.current_period_end).toISOString().slice(0, 10) : "");
    setEditOpen(true);
  };

  const beginInvoice = (s: any) => {
    setEditing(s);
    setInvoiceDue("");
    setInvoiceOpen(true);
  };

  const saveEdit = () => {
    if (!editing) return;
    updateSubscriptionMutation.mutate({
      subscriptionId: editing.id,
      patch: {
        plan_id: editing.plan_id,
        status: editing.status,
        current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
      },
    });
    setEditOpen(false);
  };

  return (
    <div>
      <MasterPageTitle title="Assinaturas" subtitle="Acompanhe status e plano por empresa." />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${data?.length ?? 0} assinatura(s)`}
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar as assinaturas.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Período atual (fim)</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={5} />
                ))}
              {!isLoading &&
                (data ?? []).map((s: any) => (
                <tr key={s.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{s.companies?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.companies?.slug ?? ""}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {s.plans?.name ?? "—"} {s.plans?.price != null ? `· R$ ${Number(s.plans.price).toFixed(2)}` : ""}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant(s.status)}>{statusLabel(s.status)}</Badge>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => beginInvoice(s)}
                        disabled={createInvoiceMutation.isPending}
                      >
                        Gerar cobrança
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => beginEdit(s)}
                        disabled={updateSubscriptionMutation.isPending}
                      >
                        Editar
                      </Button>
                      {s.status !== "active" && s.status !== "trialing" ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateSubscriptionMutation.mutate({ subscriptionId: s.id, patch: { status: "active" } })
                          }
                          disabled={updateSubscriptionMutation.isPending}
                        >
                          Reativar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            updateSubscriptionMutation.mutate({ subscriptionId: s.id, patch: { status: "paused" } })
                          }
                          disabled={updateSubscriptionMutation.isPending}
                        >
                          Pausar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          updateSubscriptionMutation.mutate({ subscriptionId: s.id, patch: { status: "canceled" } })
                        }
                        disabled={updateSubscriptionMutation.isPending}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-0" colSpan={5}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={Repeat}
                        title="Nenhuma assinatura no sistema"
                        description="Assinaturas são criadas quando empresas concluem checkout ou quando você configura o billing manualmente."
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Editar assinatura</DialogTitle>
            <DialogDescription>Ajuste plano, status e data de renovação.</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Plano</span>
                <Select
                  value={editing.plan_id ?? ""}
                  onValueChange={(v) => setEditing((x: any) => ({ ...x, plan_id: v || null }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {(plansQuery.data ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · R$ {Number(p.price).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Select
                  value={editing.status ?? "active"}
                  onValueChange={(v) => setEditing((x: any) => ({ ...x, status: v }))}
                >
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
                <span className="text-xs font-medium text-muted-foreground">Fim do período (renovação)</span>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateSubscriptionMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={updateSubscriptionMutation.isPending}>
              {updateSubscriptionMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Gerar cobrança pendente</DialogTitle>
            <DialogDescription>
              Cria um pagamento pendente para esta assinatura, sem alterar o período.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Vencimento (opcional)</span>
              <Input type="date" value={invoiceDue} onChange={(e) => setInvoiceDue(e.target.value)} />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)} disabled={createInvoiceMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending}>
              {createInvoiceMutation.isPending ? "Gerando…" : "Gerar cobrança"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

