import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { MasterPlanFeaturesEditor } from "@/components/master/MasterPlanFeaturesEditor";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import { AdminEmptyState, AdminServiceCardSkeleton } from "@/components/admin/AdminPageStates";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";

export const Route = createFileRoute("/master/planos")({
  component: MasterPlanos,
});

function MasterPlanos() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: "",
    active: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "plans"],
    queryFn: async () => {
      const res = await masterService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const price = Number(form.price);
      if (!name || Number.isNaN(price)) throw new Error("Dados inválidos");
      const res = await masterService.createPlan({
        name,
        price,
        features: [],
        active: form.active,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async (row: { id?: string }) => {
      if (row?.id) setEditingId(row.id);
      toast.success("Plano criado. Ajuste os recursos abaixo.");
      await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
    },
    onError: (err: unknown) => {
      toast.error(formatSupabaseApiError(err));
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("Sem plano");
      const name = form.name.trim();
      const price = Number(form.price);
      if (!name || Number.isNaN(price)) throw new Error("Dados inválidos");
      const res = await masterService.updatePlan(editingId, {
        name,
        price,
        active: form.active,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      toast.success("Plano atualizado.");
    },
    onError: (err: unknown) => {
      toast.error(formatSupabaseApiError(err));
    },
  });

  const beginCreate = () => {
    setEditingId(null);
    setForm({ name: "", price: "", active: true });
    setOpen(true);
  };

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await masterService.deletePlan(planId);
      if (res.error) throw res.error;
      return res;
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      toast.success("Plano excluído.");
    },
    onError: (err: unknown) => {
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
      const msg =
        err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "";
      if (code === "23503" || msg.toLowerCase().includes("foreign key")) {
        toast.error(
          "Não é possível excluir: há assinaturas ou vínculos usando este plano. Desative o plano ou migre as empresas antes.",
        );
        return;
      }
      toast.error("Não foi possível excluir o plano.");
    },
  });

  const beginEdit = (p: { id: string; name?: string; price?: number; active?: boolean }) => {
    setEditingId(p.id);
    setForm({
      name: p.name ?? "",
      price: p.price != null ? String(p.price) : "",
      active: Boolean(p.active),
    });
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setForm({ name: "", price: "", active: true });
  };

  return (
    <div>
      <MasterPageTitle
        title="Planos"
        subtitle="Catálogo de planos e feature flags por recurso (ON/OFF)."
        action={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              if (!o) closeDialog();
              else setOpen(true);
            }}
          >
            <DialogTrigger asChild>
              <Button className="rounded-full bg-foreground text-background hover:opacity-90" onClick={beginCreate}>
                Novo plano
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar plano" : "Criar plano"}</DialogTitle>
                <DialogDescription>
                  Nome, preço e recursos ON/OFF (Agenda, Anamnese, WhatsApp, Equipe…). A home lista os recursos
                  ativos.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nome</span>
                  <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Preço (mensal)</span>
                  <Input
                    value={form.price}
                    onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
                    placeholder="79"
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <span>Plano ativo</span>
                  <button
                    type="button"
                    onClick={() => setForm((s) => ({ ...s, active: !s.active }))}
                    className={`relative h-6 w-11 rounded-full transition ${form.active ? "bg-foreground" : "bg-muted"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-background transition ${form.active ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </label>

                <MasterPlanFeaturesEditor planId={editingId} planName={form.name.trim() || undefined} />
              </div>

              {(createPlanMutation.error || updatePlanMutation.error) && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Não foi possível salvar o plano. Verifique os campos e tente novamente.
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={closeDialog}
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                >
                  {editingId ? "Fechar" : "Cancelar"}
                </Button>
                <Button
                  onClick={() => (editingId ? updatePlanMutation.mutate() : createPlanMutation.mutate())}
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                >
                  {editingId
                    ? updatePlanMutation.isPending
                      ? "Salvando…"
                      : "Salvar dados"
                    : createPlanMutation.isPending
                      ? "Criando…"
                      : "Criar plano"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">Não foi possível carregar os planos.</p>
          <p className="mt-1 text-xs opacity-90">{formatSupabaseApiError(error)}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["master", "plans"] })}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Só é permitido se nenhuma assinatura estiver vinculada a este plano.
              {deleteTarget ? (
                <>
                  {" "}
                  Plano: <span className="font-medium text-foreground">{deleteTarget.name}</span>.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePlanMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePlanMutation.isPending || !deleteTarget}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deletePlanMutation.mutate(deleteTarget.id);
              }}
            >
              {deletePlanMutation.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-4 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <AdminServiceCardSkeleton key={`pl-sk-${i}`} />)}
        {!isLoading &&
          (data ?? []).map((p: { id: string; name?: string; price?: number; active?: boolean; features?: unknown }) => (
            <div key={p.id} className="relative rounded-2xl border border-border bg-card p-6 shadow-soft">
              <button
                type="button"
                className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
                aria-label={`Excluir plano ${p.name}`}
                onClick={() => setDeleteTarget({ id: p.id, name: String(p.name ?? "") })}
              >
                <X className="size-4" />
              </button>
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-gold" />
                <h3 className="font-display text-xl">{p.name}</h3>
              </div>
              <p className="mt-2 text-2xl font-semibold">
                R$ {Number(p.price ?? 0).toFixed(2).replace(".", ",")}
                <span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
              <Badge className="mt-3" variant={p.active ? "default" : "secondary"}>
                {p.active ? "Ativo" : "Inativo"}
              </Badge>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {(Array.isArray(p.features) ? p.features : []).slice(0, 5).map((f: unknown) => (
                  <li key={String(f)}>· {String(f)}</li>
                ))}
                {Array.isArray(p.features) && p.features.length > 5 && (
                  <li className="text-xs">+ {p.features.length - 5} recursos</li>
                )}
              </ul>
              <Button variant="outline" className="mt-4 w-full rounded-full" onClick={() => beginEdit(p)}>
                Editar plano e recursos
              </Button>
            </div>
          ))}
        {!isLoading && !error && (data ?? []).length === 0 && (
          <div className="lg:col-span-3">
            <AdminEmptyState
              icon={CreditCard}
              title="Nenhum plano cadastrado"
              description="Crie planos com recursos ON/OFF para as empresas assinarem."
              action={
                <Button className="rounded-full" onClick={beginCreate}>
                  Novo plano
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
