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
import { Building2 } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";
import {
  NO_PLAN_SELECT_VALUE,
  planIdToSelectValue,
  selectValueToPlanId,
} from "@/lib/plan-select-value";
import { toast } from "sonner";

export const Route = createFileRoute("/master/empresas")({
  component: MasterEmpresas,
});

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  plan_id?: string | null;
  status?: string | null;
};

type PlanRow = { id: string; name: string; price: number | string | null };

function statusLabel(status: string | null | undefined): string {
  if (status === "active") return "Ativa";
  if (status === "inactive") return "Inativa";
  if (status === "suspended") return "Suspensa";
  return "—";
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" {
  if (status === "active") return "default";
  if (status === "inactive") return "secondary";
  if (status === "suspended") return "destructive";
  return "secondary";
}

function normalizePlans(rows: unknown[] | undefined): PlanRow[] {
  const out: PlanRow[] = [];
  for (const raw of rows ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const id = p.id != null ? String(p.id).trim() : "";
    if (!id || id === NO_PLAN_SELECT_VALUE) continue;
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Plano";
    const price = p.price != null ? Number(p.price) : 0;
    out.push({ id, name, price: Number.isFinite(price) ? price : 0 });
  }
  return out;
}

function MasterEmpresas() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    email: "",
    phone: "",
    planId: NO_PLAN_SELECT_VALUE,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "companies"],
    queryFn: async () => {
      const res = await masterService.listCompanies();
      if (res.error) throw res.error;
      return (res.data ?? []) as CompanyRow[];
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

  const plans = useMemo(() => normalizePlans(plansQuery.data as unknown[]), [plansQuery.data]);

  const planCatalogIds = useMemo(() => new Set(plans.map((p) => p.id)), [plans]);

  const plansById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; price: number }>();
    for (const p of plans) {
      map.set(p.id, { id: p.id, name: p.name, price: Number(p.price) });
    }
    return map;
  }, [plans]);

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      const slug = createForm.slug.trim();
      const name = createForm.name.trim();
      if (!slug || !name) {
        throw new Error("Preencha nome e slug.");
      }
      const res = await masterService.createCompany({
        name,
        slug,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        plan_id: selectValueToPlanId(createForm.planId),
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Empresa criada.");
      setCreateOpen(false);
      setCreateForm({ name: "", slug: "", email: "", phone: "", planId: NO_PLAN_SELECT_VALUE });
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível criar a empresa (slug duplicado ou dados inválidos).";
      toast.error(msg);
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (input: { companyId: string; status?: string; plan_id?: string | null }) => {
      const res = await masterService.updateCompany(input.companyId, {
        status: input.status,
        plan_id: input.plan_id,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Empresa atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível atualizar a empresa.";
      toast.error(msg);
    },
  });

  const planSelectDisabled = updateCompanyMutation.isPending || plansQuery.isLoading;

  return (
    <div>
      <MasterPageTitle
        title="Empresas"
        subtitle="Gerencie empresas cadastradas, status e dados de contato."
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button type="button" className="rounded-full bg-foreground text-background hover:opacity-90">
                Nova empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Criar empresa</DialogTitle>
                <DialogDescription>
                  Crie uma empresa cliente manualmente. O slug será usado na URL pública.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nome</span>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="Studio Exemplo"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Slug</span>
                  <Input
                    value={createForm.slug}
                    onChange={(e) => setCreateForm((s) => ({ ...s, slug: e.target.value }))}
                    placeholder="studio-exemplo"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Use apenas letras minúsculas, números e hífen.
                  </span>
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">E-mail</span>
                    <Input
                      value={createForm.email}
                      onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
                      placeholder="contato@empresa.com"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Telefone</span>
                    <Input
                      value={createForm.phone}
                      onChange={(e) => setCreateForm((s) => ({ ...s, phone: e.target.value }))}
                      placeholder="(11) 90000-0000"
                    />
                  </label>
                </div>

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Plano</span>
                  <Select
                    value={createForm.planId}
                    onValueChange={(v) => setCreateForm((s) => ({ ...s, planId: v }))}
                    disabled={plansQuery.isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          plansQuery.isLoading
                            ? "Carregando planos…"
                            : plansQuery.isError
                              ? "Erro ao carregar planos"
                              : "Selecione um plano (opcional)"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLAN_SELECT_VALUE}>Sem plano</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · R$ {p.price.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {plansQuery.isError && (
                    <p className="text-[11px] text-destructive">
                      Não foi possível carregar a lista de planos. Tente fechar e abrir o diálogo ou atualize a página.
                    </p>
                  )}
                </label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={createCompanyMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => createCompanyMutation.mutate()}
                  disabled={createCompanyMutation.isPending}
                >
                  {createCompanyMutation.isPending ? "Criando…" : "Criar empresa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${data?.length ?? 0} empresa(s)`}
        </div>

        {error && (
          <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-4 text-sm text-destructive">
            Não foi possível carregar as empresas. Verifique sessão Master e políticas RLS no Supabase.
          </div>
        )}

        {plansQuery.isError && !isLoading && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm text-destructive">
            <span>Não foi possível carregar os planos (edição de plano por linha fica limitada até corrigir).</span>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void plansQuery.refetch()}>
              Tentar planos de novo
            </Button>
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Telefone</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={7} />
                ))}
              {!isLoading &&
                (data ?? []).map((c) => {
                  const pid = c.plan_id != null ? String(c.plan_id).trim() : "";
                  const orphanPlan =
                    Boolean(pid) && pid !== NO_PLAN_SELECT_VALUE && !planCatalogIds.has(pid);
                  const selectValue = planIdToSelectValue(c.plan_id);

                  return (
                    <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">{c.name ?? "—"}</div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{c.slug ?? "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground">{c.email ?? "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground">{c.phone ?? "—"}</td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[220px] items-center gap-2">
                          <Select
                            value={selectValue}
                            onValueChange={(v) =>
                              updateCompanyMutation.mutate({
                                companyId: c.id,
                                plan_id: selectValueToPlanId(v),
                              })
                            }
                            disabled={planSelectDisabled}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Sem plano" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_PLAN_SELECT_VALUE}>Sem plano</SelectItem>
                              {orphanPlan && (
                                <SelectItem value={pid} className="text-amber-700 dark:text-amber-400">
                                  Plano legado (fora da lista)
                                </SelectItem>
                              )}
                              {plans.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">
                            {pid && plansById.get(pid) ? `R$ ${plansById.get(pid)!.price.toFixed(2)}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={statusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          {c.status !== "active" ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => updateCompanyMutation.mutate({ companyId: c.id, status: "active" })}
                              disabled={updateCompanyMutation.isPending}
                            >
                              Ativar
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateCompanyMutation.mutate({ companyId: c.id, status: "suspended" })
                              }
                              disabled={updateCompanyMutation.isPending}
                            >
                              Bloquear
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              updateCompanyMutation.mutate({ companyId: c.id, status: "inactive" })
                            }
                            disabled={updateCompanyMutation.isPending}
                          >
                            Inativar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-0" colSpan={7}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={Building2}
                        title="Nenhuma empresa ainda"
                        description="Cadastre a primeira empresa manualmente ou aguarde novos studios pelo fluxo de cadastro do site."
                        action={
                          <Button
                            type="button"
                            className="rounded-full bg-foreground text-background hover:opacity-90"
                            onClick={() => setCreateOpen(true)}
                          >
                            Nova empresa
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
