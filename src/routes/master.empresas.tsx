import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService, type MasterCompanyRow } from "@/services/masterService";
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
import {
  Ban,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Pencil,
  RefreshCw,
  Search,
  ShieldOff,
  UserX,
} from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";
import {
  NO_PLAN_SELECT_VALUE,
  planIdToSelectValue,
  selectValueToPlanId,
} from "@/lib/plan-select-value";
import { toast } from "sonner";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from "@/lib/public-booking-slug";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/master/empresas")({
  component: MasterEmpresas,
});

type PlanRow = { id: string; name: string; price: number };
type TabKey = "todas" | "ativas" | "suspensas" | "inativas" | "sem_plano";
type ConfirmKind = "suspend" | "inactive" | "activate" | null;

function statusLabel(status: string | null | undefined): string {
  if (status === "active") return "Ativa";
  if (status === "inactive") return "Inativa";
  if (status === "suspended") return "Suspensa";
  return "—";
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "inactive") return "secondary";
  if (status === "suspended") return "destructive";
  return "outline";
}

function subStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sem assinatura";
  const map: Record<string, string> = {
    trialing: "Teste",
    active: "Assinatura ativa",
    past_due: "Em atraso",
    canceled: "Cancelada",
    paused: "Pausada",
    pending_payment: "Aguardando pgto",
    trial_expired: "Trial expirado",
  };
  return map[status] ?? status;
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

function slugFromName(name: string): string {
  return normalizePublicBookingSlug(
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, " "),
  );
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
  const [tab, setTab] = useState<TabKey>("todas");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    email: "",
    phone: "",
    planId: NO_PLAN_SELECT_VALUE,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MasterCompanyRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    email: "",
    phone: "",
  });

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [confirmTarget, setConfirmTarget] = useState<MasterCompanyRow | null>(null);

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["master", "companies"],
    queryFn: async () => {
      const res = await masterService.listCompanies();
      if (res.error) throw res.error;
      return (res.data ?? []) as MasterCompanyRow[];
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
    const map = new Map<string, PlanRow>();
    for (const p of plans) map.set(p.id, p);
    return map;
  }, [plans]);

  const counts = useMemo(() => {
    const rows = data ?? [];
    return {
      todas: rows.length,
      ativas: rows.filter((c) => c.status === "active").length,
      suspensas: rows.filter((c) => c.status === "suspended").length,
      inativas: rows.filter((c) => c.status === "inactive").length,
      sem_plano: rows.filter((c) => !c.plan_id).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (tab === "ativas" && c.status !== "active") return false;
      if (tab === "suspensas" && c.status !== "suspended") return false;
      if (tab === "inativas" && c.status !== "inactive") return false;
      if (tab === "sem_plano" && c.plan_id) return false;
      if (!q) return true;
      const hay = [c.name, c.slug, c.email, c.phone, c.plan_name, c.subscription_status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, tab, search]);

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      const name = createForm.name.trim();
      const slug = normalizePublicBookingSlug(createForm.slug.trim());
      if (!name || !slug) throw new Error("Preencha nome e slug.");
      if (!isValidPublicBookingSlug(slug)) throw new Error("Slug inválido. Use letras, números e hífen.");
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
      setSlugTouched(false);
      setCreateForm({ name: "", slug: "", email: "", phone: "", planId: NO_PLAN_SELECT_VALUE });
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
    },
    onError: (err: unknown) => {
      toast.error(
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível criar a empresa (slug duplicado ou dados inválidos).",
      );
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (input: {
      companyId: string;
      status?: string;
      plan_id?: string | null;
      name?: string;
      slug?: string;
      email?: string | null;
      phone?: string | null;
    }) => {
      const res = await masterService.updateCompany(input.companyId, {
        status: input.status,
        plan_id: input.plan_id,
        name: input.name,
        slug: input.slug,
        email: input.email,
        phone: input.phone,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Empresa atualizada.");
      setConfirmKind(null);
      setConfirmTarget(null);
      setEditOpen(false);
      setEditTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["master", "companies"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["master", "payments"] });
    },
    onError: (err: unknown) => {
      toast.error(
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível atualizar a empresa.",
      );
    },
  });

  const planSelectDisabled = updateCompanyMutation.isPending || plansQuery.isLoading;

  function openEdit(c: MasterCompanyRow) {
    setEditTarget(c);
    setEditForm({
      name: c.name ?? "",
      slug: c.slug ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
    });
    setEditOpen(true);
  }

  function openConfirm(kind: ConfirmKind, c: MasterCompanyRow) {
    setConfirmKind(kind);
    setConfirmTarget(c);
  }

  async function copyBookingLink(slug: string) {
    const path = `${window.location.origin}/agendar/${encodeURIComponent(slug)}`;
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Link de agendamento copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  const tabs: { id: TabKey; label: string; count: number }[] = [
    { id: "todas", label: "Todas", count: counts.todas },
    { id: "ativas", label: "Ativas", count: counts.ativas },
    { id: "suspensas", label: "Suspensas", count: counts.suspensas },
    { id: "inativas", label: "Inativas", count: counts.inativas },
    { id: "sem_plano", label: "Sem plano", count: counts.sem_plano },
  ];

  return (
    <div className="relative space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-10 h-64 w-64 rounded-full bg-gold/15 blur-3xl"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <MasterPageTitle
          title="Empresas"
          subtitle="Cadastro, plano, status e link público de cada studio."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) setSlugTouched(false);
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" className="rounded-full bg-foreground text-background hover:opacity-90">
                Nova empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>Criar empresa</DialogTitle>
                <DialogDescription>
                  Cadastro manual. O slug vira a URL pública `/agendar/…`.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nome</span>
                  <Input
                    value={createForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setCreateForm((s) => ({
                        ...s,
                        name,
                        slug: slugTouched ? s.slug : slugFromName(name),
                      }));
                    }}
                    placeholder="Studio Exemplo"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Slug</span>
                  <Input
                    value={createForm.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setCreateForm((s) => ({ ...s, slug: e.target.value }));
                    }}
                    placeholder="studio-exemplo"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Letras minúsculas, números e hífen.
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
                      <SelectValue placeholder="Selecione um plano (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLAN_SELECT_VALUE}>Sem plano</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {moneyBRL(p.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
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
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] border border-charcoal/20 bg-charcoal px-5 py-6 text-primary-foreground shadow-elegant sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 15% 20%, oklch(0.78 0.085 82 / 0.35), transparent 55%)",
          }}
        />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Command center · tenants</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl">
            {counts.todas} empresa{counts.todas === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-primary-foreground/70">
            Ative, bloqueie ou ajuste o plano. O link `/agendar/slug` abre a página pública.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="Ativas" value={String(counts.ativas)} />
            <HeroStat label="Suspensas" value={String(counts.suspensas)} />
            <HeroStat label="Inativas" value={String(counts.inativas)} />
            <HeroStat label="Sem plano" value={String(counts.sem_plano)} />
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">{t.count}</span>
          </Button>
        ))}
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, slug, e-mail, plano…"
            className="h-9 rounded-full pl-9"
          />
        </div>
      </div>

      {error ? (
        <AdminEmptyState
          title="Não foi possível carregar as empresas"
          description={formatSupabaseApiError(error)}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3 text-sm text-muted-foreground">
            <span>
              {isLoading ? "Carregando…" : `${filtered.length} resultado(s)`}
              {tab !== "todas" || search ? " · filtro ativo" : ""}
            </span>
            <Link to="/master/assinaturas" className="text-xs font-medium text-gold hover:underline">
              Ver assinaturas →
            </Link>
          </div>

          {plansQuery.isError && !isLoading && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm text-destructive">
              <span>Planos indisponíveis — troca de plano fica limitada.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void plansQuery.refetch()}>
                Tentar de novo
              </Button>
            </div>
          )}

          <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-5 py-3">Contato</th>
                  <th className="px-5 py-3">Plano</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Assinatura</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <AdminTableRowSkeleton key={`sk-${i}`} cols={6} />
                  ))}

                {!isLoading &&
                  filtered.map((c) => {
                    const pid = c.plan_id != null ? String(c.plan_id).trim() : "";
                    const orphanPlan =
                      Boolean(pid) && pid !== NO_PLAN_SELECT_VALUE && !planCatalogIds.has(pid);
                    const selectValue = planIdToSelectValue(c.plan_id);
                    const bookingSlug = normalizePublicBookingSlug(c.slug ?? "");
                    const bookingSlugValid =
                      bookingSlug.length > 0 && isValidPublicBookingSlug(bookingSlug);
                    const planLabel =
                      c.plan_name ||
                      (pid && plansById.get(pid)?.name) ||
                      (orphanPlan ? "Plano legado" : null);
                    const planPrice =
                      c.plan_price != null
                        ? Number(c.plan_price)
                        : pid
                          ? plansById.get(pid)?.price
                          : null;

                    return (
                      <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                        <td className="px-5 py-4">
                          <div className="font-medium text-foreground">{c.name ?? "—"}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {bookingSlugValid ? (
                              <>
                                <a
                                  href={`/agendar/${encodeURIComponent(bookingSlug)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                                >
                                  {bookingSlug}
                                  <ExternalLink className="size-3" />
                                </a>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={() => void copyBookingLink(bookingSlug)}
                                >
                                  <Copy className="size-3" />
                                  Copiar link
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Slug inválido</span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Desde {formatDate(c.created_at)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-muted-foreground">{c.email || "—"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{c.phone || "Sem telefone"}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex min-w-[200px] flex-col gap-1">
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
                            <span className="text-[10px] text-muted-foreground">
                              {planLabel
                                ? `${planLabel}${planPrice != null ? ` · ${moneyBRL(planPrice)}` : ""}`
                                : "Sem plano"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant={statusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs font-medium">{subStatusLabel(c.subscription_status)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {c.subscription_period_end
                              ? `Até ${formatDate(c.subscription_period_end)}`
                              : "—"}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => openEdit(c)}
                            >
                              <Pencil className="size-3.5" />
                              Editar
                            </Button>
                            {c.status !== "active" ? (
                              <Button
                                type="button"
                                size="sm"
                                className="rounded-full"
                                onClick={() => openConfirm("activate", c)}
                                disabled={updateCompanyMutation.isPending}
                              >
                                <CheckCircle2 className="size-3.5" />
                                Ativar
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => openConfirm("suspend", c)}
                                disabled={updateCompanyMutation.isPending}
                              >
                                <Ban className="size-3.5" />
                                Bloquear
                              </Button>
                            )}
                            {c.status !== "inactive" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="rounded-full"
                                onClick={() => openConfirm("inactive", c)}
                                disabled={updateCompanyMutation.isPending}
                              >
                                <UserX className="size-3.5" />
                                Inativar
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td className="p-0" colSpan={6}>
                      <div className="p-4">
                        <AdminEmptyState
                          icon={Building2}
                          title={search || tab !== "todas" ? "Nenhum resultado" : "Nenhuma empresa ainda"}
                          description={
                            search || tab !== "todas"
                              ? "Ajuste a busca ou o filtro de status."
                              : "Cadastre a primeira empresa ou aguarde o fluxo de cadastro do site."
                          }
                          action={
                            !search && tab === "todas" ? (
                              <Button
                                type="button"
                                className="rounded-full bg-foreground text-background hover:opacity-90"
                                onClick={() => setCreateOpen(true)}
                              >
                                Nova empresa
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
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>Atualize nome, slug e contato.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Nome</span>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Slug</span>
              <Input
                value={editForm.slug}
                onChange={(e) => setEditForm((s) => ({ ...s, slug: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">E-mail</span>
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm((s) => ({ ...s, email: e.target.value }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Telefone</span>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((s) => ({ ...s, phone: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={updateCompanyMutation.isPending || !editTarget}
              onClick={() => {
                if (!editTarget) return;
                const slug = normalizePublicBookingSlug(editForm.slug.trim());
                if (!editForm.name.trim() || !isValidPublicBookingSlug(slug)) {
                  toast.error("Nome e slug válidos são obrigatórios.");
                  return;
                }
                updateCompanyMutation.mutate({
                  companyId: editTarget.id,
                  name: editForm.name.trim(),
                  slug,
                  email: editForm.email.trim() || null,
                  phone: editForm.phone.trim() || null,
                });
              }}
            >
              {updateCompanyMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm status */}
      <Dialog
        open={Boolean(confirmKind && confirmTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKind(null);
            setConfirmTarget(null);
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmKind === "activate" ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : confirmKind === "suspend" ? (
                <ShieldOff className="size-5 text-destructive" />
              ) : (
                <UserX className="size-5" />
              )}
              {confirmKind === "activate"
                ? "Ativar empresa"
                : confirmKind === "suspend"
                  ? "Bloquear empresa"
                  : "Inativar empresa"}
            </DialogTitle>
            <DialogDescription>
              {confirmKind === "activate"
                ? `Reativar “${confirmTarget?.name}”? O painel volta a funcionar conforme a assinatura.`
                : confirmKind === "suspend"
                  ? `Bloquear “${confirmTarget?.name}”? O acesso do salão fica suspenso até reativação.`
                  : `Inativar “${confirmTarget?.name}”? Use para encerrar operação sem apagar o cadastro.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmKind(null);
                setConfirmTarget(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={confirmKind === "activate" ? "default" : "destructive"}
              disabled={updateCompanyMutation.isPending || !confirmTarget || !confirmKind}
              onClick={() => {
                if (!confirmTarget || !confirmKind) return;
                const status =
                  confirmKind === "activate"
                    ? "active"
                    : confirmKind === "suspend"
                      ? "suspended"
                      : "inactive";
                updateCompanyMutation.mutate({ companyId: confirmTarget.id, status });
              }}
            >
              {updateCompanyMutation.isPending
                ? "Aplicando…"
                : confirmKind === "activate"
                  ? "Confirmar ativação"
                  : confirmKind === "suspend"
                    ? "Confirmar bloqueio"
                    : "Confirmar inativação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-primary-foreground/55">{label}</div>
      <div className="mt-0.5 font-display text-lg text-gold">{value}</div>
    </div>
  );
}
