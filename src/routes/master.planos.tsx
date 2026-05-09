import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreditCard } from "lucide-react";
import { AdminEmptyState, AdminServiceCardSkeleton } from "@/components/admin/AdminPageStates";

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
    featuresText: "",
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

  const featuresPreview = useMemo(() => {
    return form.featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [form.featuresText]);

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const price = Number(form.price);
      if (!name || Number.isNaN(price)) throw new Error("Dados inválidos");
      const res = await masterService.createPlan({
        name,
        price,
        features: featuresPreview,
        active: form.active,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      setEditingId(null);
      setForm({ name: "", price: "", featuresText: "", active: true });
      await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
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
        features: featuresPreview,
        active: form.active,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      setEditingId(null);
      setForm({ name: "", price: "", featuresText: "", active: true });
      await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
    },
  });

  const beginCreate = () => {
    setEditingId(null);
    setForm({ name: "", price: "", featuresText: "", active: true });
    setOpen(true);
  };

  const beginEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name ?? "",
      price: p.price != null ? String(p.price) : "",
      featuresText: Array.isArray(p.features) ? p.features.map((x: unknown) => String(x)).join("\n") : "",
      active: Boolean(p.active),
    });
    setOpen(true);
  };

  return (
    <div>
      <MasterPageTitle
        title="Planos"
        subtitle="Catálogo de planos do SaaS."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-foreground text-background hover:opacity-90" onClick={beginCreate}>
                Novo plano
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar plano" : "Criar plano"}</DialogTitle>
                <DialogDescription>
                  Defina nome, preço e recursos. A lista de recursos usa uma linha por item.
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

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Recursos (1 por linha)</span>
                  <Textarea
                    value={form.featuresText}
                    onChange={(e) => setForm((s) => ({ ...s, featuresText: e.target.value }))}
                    placeholder={"Agenda online\nCadastro de clientes\nRelatórios"}
                    className="min-h-[140px]"
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
              </div>

              {(createPlanMutation.error || updatePlanMutation.error) && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Não foi possível salvar o plano. Verifique os campos e tente novamente.
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => (editingId ? updatePlanMutation.mutate() : createPlanMutation.mutate())}
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                >
                  {editingId
                    ? updatePlanMutation.isPending
                      ? "Salvando…"
                      : "Salvar alterações"
                    : createPlanMutation.isPending
                      ? "Criando…"
                      : "Criar plano"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <AdminServiceCardSkeleton key={`pl-sk-${i}`} />)}
        {!isLoading &&
          (data ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-xl">{p.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">R$ {Number(p.price).toFixed(2)}/mês</div>
              </div>
              <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              {(Array.isArray(p.features) ? p.features : []).slice(0, 8).map((f: unknown, idx: number) => (
                <div key={idx}>• {String(f)}</div>
              ))}
              {(Array.isArray(p.features) ? p.features : []).length === 0 && <div>Sem recursos cadastrados.</div>}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button variant="outline" className="w-full" onClick={() => beginEdit(p)}>
                Editar
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="lg:col-span-3">
            <AdminEmptyState
              icon={CreditCard}
              title="Nenhum plano cadastrado"
              description="Crie os planos que aparecerão no site e no checkout. Cada plano pode ter lista de benefícios e preço mensal."
              action={
                <Button
                  className="rounded-full bg-foreground text-background hover:opacity-90"
                  onClick={beginCreate}
                >
                  Novo plano
                </Button>
              }
            />
          </div>
        )}
      </div>

      {error && <div className="mt-4 text-sm text-destructive">Não foi possível carregar os planos.</div>}
    </div>
  );
}

