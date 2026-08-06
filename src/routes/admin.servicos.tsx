import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Plus, Pencil, Power, Scissors, Trash2, Upload } from "lucide-react";
import { AdminEmptyState, AdminServiceCardSkeleton } from "@/components/admin/AdminPageStates";
import { parseBrDecimal, parseBrInteger } from "@/lib/br-number-input";
import { useCurrentCompany } from "@/lib/current-company";
import { hasFeatureAccess } from "@/lib/plan-access";
import { serviceService } from "@/services/serviceService";
import { ServiceConsumablesEditor } from "@/components/admin/ServiceConsumablesEditor";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadCompanyImage } from "@/lib/company-media-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  adminMobileDialogBodyClass,
  adminMobileDialogContentClass,
  adminMobileDialogFooterClass,
  adminMobileDialogHeaderClass,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/servicos")({
  component: Servicos,
});

/** Traduz falhas de validação, RLS e schema em algo acionável para o salão. */
function describeServiceSaveError(error: unknown): string {
  const e = (error ?? {}) as { message?: string; code?: string; details?: string; hint?: string };
  const message = String(e.message ?? "").trim();
  const code = String(e.code ?? "");

  if (code === "42501" || /row-level security/i.test(message)) {
    return "Sem permissão para salvar serviços. Verifique se sua assinatura está ativa e se você é dono/administrador da empresa.";
  }
  if (code === "PGRST204" || /column .* does not exist/i.test(message)) {
    return "O banco está desatualizado (coluna ausente em services). Aplique as migrations pendentes no Supabase.";
  }
  if (/duration_minutes/i.test(message)) {
    return "Duração inválida: informe os minutos em número inteiro maior que zero.";
  }
  if (/price/i.test(message) && /check|constraint/i.test(message)) {
    return "Preço inválido: use apenas números (ex.: 60 ou 60,00) e valor maior ou igual a zero.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return "Falha de conexão ao salvar. Verifique a internet e tente novamente.";
  }

  return message || "Não foi possível salvar. Verifique os campos e tente novamente.";
}

function Servicos() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewBlob, setImagePreviewBlob] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    duration_minutes: "60",
    buffer_minutes: "0",
    image_url: "",
    active: true,
    require_anamnesis: false,
    service_kind: "single" as "single" | "package",
    package_sessions: "4",
    package_allowed_dow: [2, 3, 4, 5, 6] as number[],
    package_max_per_week: "1",
    package_valid_days: "",
  });

  const packagesQuery = useQuery({
    queryKey: ["admin", "feature", "packages", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "packages"),
  });
  const packagesEnabled = Boolean(packagesQuery.data);

  const anamnesisQuery = useQuery({
    queryKey: ["admin", "feature", "anamnesis", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "anamnesis"),
  });
  const anamnesisEnabled = Boolean(anamnesisQuery.data);

  const inventoryQuery = useQuery({
    queryKey: ["admin", "feature", "inventory", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "inventory"),
  });
  const inventoryEnabled = Boolean(inventoryQuery.data);

  const servicesQuery = useQuery({
    queryKey: ["admin", "services", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await serviceService.listByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const cards = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) {
        throw new Error("Nenhuma empresa selecionada. Recarregue a página e entre novamente.");
      }

      const isPackage = packagesEnabled && form.service_kind === "package";

      // Validação antes do upload: evita enviar imagem para o Storage e falhar depois.
      const name = form.name.trim();
      if (!name) throw new Error("Informe o nome do serviço.");

      const price = parseBrDecimal(form.price);
      if (price == null) throw new Error("Informe o preço (ex.: 60 ou 60,00).");
      if (price < 0) throw new Error("O preço não pode ser negativo.");

      const durationMinutes = parseBrInteger(form.duration_minutes);
      if (durationMinutes == null || durationMinutes <= 0) {
        throw new Error("Informe a duração em minutos (maior que zero).");
      }

      const bufferMinutes = parseBrInteger(form.buffer_minutes) ?? 0;
      if (bufferMinutes < 0) throw new Error("O buffer não pode ser negativo.");

      let packageSessions: number | null = null;
      let packageMaxPerWeek: number | null = null;
      let packageValidDays: number | null = null;
      if (isPackage) {
        packageSessions = parseBrInteger(form.package_sessions);
        if (packageSessions == null || packageSessions < 1) {
          throw new Error("Informe quantas sessões o pacote tem (mínimo 1).");
        }
        packageMaxPerWeek = parseBrInteger(form.package_max_per_week);
        if (packageMaxPerWeek == null || packageMaxPerWeek < 1) {
          throw new Error("Informe o máximo de sessões por semana (mínimo 1).");
        }
        if (form.package_valid_days.trim()) {
          packageValidDays = parseBrInteger(form.package_valid_days);
          if (packageValidDays == null || packageValidDays < 1) {
            throw new Error("A validade do pacote deve ser um número de dias maior que zero.");
          }
        }
        if (form.package_allowed_dow.length === 0) {
          throw new Error("Selecione pelo menos um dia permitido para o pacote.");
        }
      }

      let image_url: string | null = form.image_url.trim() || null;
      if (imageFile) {
        const { publicUrl, error } = await uploadCompanyImage(companyId, "service", imageFile, {
          serviceId: editing?.id,
        });
        if (error || !publicUrl) {
          throw new Error(
            `Não foi possível enviar a imagem${error?.message ? ` (${error.message})` : ""}. Remova a imagem e salve o serviço, ou tente novamente.`,
          );
        }
        image_url = publicUrl;
      }

      const payload = {
        name,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        price,
        duration_minutes: durationMinutes,
        buffer_minutes: bufferMinutes,
        image_url,
        active: Boolean(form.active),
        require_anamnesis: anamnesisEnabled ? Boolean(form.require_anamnesis) : false,
        service_kind: isPackage ? ("package" as const) : ("single" as const),
        package_sessions: isPackage ? packageSessions : null,
        package_allowed_dow: isPackage ? form.package_allowed_dow : null,
        package_max_per_week: isPackage ? packageMaxPerWeek : null,
        package_valid_days: isPackage ? packageValidDays : null,
      };

      if (editing?.id) {
        const res = await serviceService.update(companyId, editing.id, payload);
        if (res.error) throw res.error;
        return res.data;
      }
      const res = await serviceService.create(companyId, payload);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setImagePreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setImageFile(null);
      setOpen(false);
      setEditing(null);
      setForm({
        name: "",
        description: "",
        category: "",
        price: "",
        duration_minutes: "60",
        buffer_minutes: "0",
        image_url: "",
        active: true,
        require_anamnesis: false,
        service_kind: "single",
        package_sessions: "4",
        package_allowed_dow: [2, 3, 4, 5, 6],
        package_max_per_week: "1",
        package_valid_days: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "services", companyId] });
      toast.success("Serviço salvo com sucesso");
    },
    onError: (error) => {
      toast.error(describeServiceSaveError(error));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (s: any) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await serviceService.update(companyId, s.id, { active: !s.active });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "services", companyId] });
    },
    onError: (error) => {
      toast.error(describeServiceSaveError(error));
    },
  });

  const beginCreate = () => {
    setImagePreviewBlob((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
    setEditing(null);
    setForm({
      name: "",
      description: "",
      category: "",
      price: "",
      duration_minutes: "60",
      buffer_minutes: "0",
      image_url: "",
      active: true,
      require_anamnesis: false,
      service_kind: "single",
      package_sessions: "4",
      package_allowed_dow: [2, 3, 4, 5, 6],
      package_max_per_week: "1",
      package_valid_days: "",
    });
    setOpen(true);
  };

  const beginEdit = (s: any) => {
    setImagePreviewBlob((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
    setEditing(s);
    setForm({
      name: s.name ?? "",
      description: s.description ?? "",
      category: s.category ?? "",
      price: s.price != null ? String(s.price) : "",
      duration_minutes: s.duration_minutes != null ? String(s.duration_minutes) : "60",
      buffer_minutes: s.buffer_minutes != null ? String(s.buffer_minutes) : "0",
      image_url: s.image_url ?? "",
      active: Boolean(s.active),
      require_anamnesis: Boolean(s.require_anamnesis),
      service_kind: s.service_kind === "package" ? "package" : "single",
      package_sessions: s.package_sessions != null ? String(s.package_sessions) : "4",
      package_allowed_dow: Array.isArray(s.package_allowed_dow)
        ? (s.package_allowed_dow as number[])
        : [2, 3, 4, 5, 6],
      package_max_per_week: s.package_max_per_week != null ? String(s.package_max_per_week) : "1",
      package_valid_days: s.package_valid_days != null ? String(s.package_valid_days) : "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageTitle
        title="Serviços"
        subtitle="Gerencie seu catálogo de serviços"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                onClick={beginCreate}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background"
              >
                <Plus className="size-4" /> Novo serviço
              </button>
            </DialogTrigger>
            <DialogContent className={adminMobileDialogContentClass}>
              <DialogHeader className={adminMobileDialogHeaderClass}>
                <DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
                <DialogDescription>Catálogo de serviços da sua empresa.</DialogDescription>
              </DialogHeader>

              <div className={adminMobileDialogBodyClass}>
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nome</span>
                  <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                      placeholder="Ex.: Cabelo"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Preço (R$)</span>
                    <Input
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
                      placeholder="Ex.: 120"
                    />
                  </label>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Descrição</span>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    placeholder="Opcional"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Duração (min)</span>
                    <Input
                      inputMode="numeric"
                      value={form.duration_minutes}
                      onChange={(e) => setForm((s) => ({ ...s, duration_minutes: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Buffer (min)</span>
                    <Input
                      inputMode="numeric"
                      value={form.buffer_minutes}
                      onChange={(e) => setForm((s) => ({ ...s, buffer_minutes: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Status</span>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.active ? "ativo" : "inativo"}
                      onChange={(e) => setForm((s) => ({ ...s, active: e.target.value === "ativo" }))}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </label>
                </div>
                {anamnesisEnabled ? (
                  <label className="flex items-start gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.require_anamnesis}
                      onChange={(e) => setForm((s) => ({ ...s, require_anamnesis: e.target.checked }))}
                    />
                    <span>
                      <span className="font-medium">Exige anamnese</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Cliente recebe link seguro após agendar. Não bloqueia o horário — só sinaliza pendência.
                      </span>
                    </span>
                  </label>
                ) : null}
                {packagesEnabled ? (
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Tipo de serviço</span>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={form.service_kind}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            service_kind: e.target.value as "single" | "package",
                          }))
                        }
                      >
                        <option value="single">Avulso</option>
                        <option value="package">Pacote</option>
                      </select>
                    </label>
                    {form.service_kind === "package" ? (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1.5 text-sm">
                          Sessões no pacote
                          <Input
                            inputMode="numeric"
                            value={form.package_sessions}
                            onChange={(e) => setForm((s) => ({ ...s, package_sessions: e.target.value }))}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm">
                          Máx. por semana
                          <Input
                            inputMode="numeric"
                            value={form.package_max_per_week}
                            onChange={(e) => setForm((s) => ({ ...s, package_max_per_week: e.target.value }))}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm md:col-span-2">
                          Validade (dias após ativação)
                          <Input
                            inputMode="numeric"
                            value={form.package_valid_days}
                            onChange={(e) => setForm((s) => ({ ...s, package_valid_days: e.target.value }))}
                            placeholder="Opcional"
                          />
                        </label>
                        <div className="md:col-span-2">
                          <span className="text-xs font-medium text-muted-foreground">Dias permitidos</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[
                              [1, "Seg"],
                              [2, "Ter"],
                              [3, "Qua"],
                              [4, "Qui"],
                              [5, "Sex"],
                              [6, "Sáb"],
                              [7, "Dom"],
                            ].map(([dow, label]) => {
                              const n = dow as number;
                              const checked = form.package_allowed_dow.includes(n);
                              return (
                                <label key={n} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setForm((s) => ({
                                        ...s,
                                        package_allowed_dow: checked
                                          ? s.package_allowed_dow.filter((x) => x !== n)
                                          : [...s.package_allowed_dow, n].sort(),
                                      }));
                                    }}
                                  />
                                  {label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Imagem do serviço</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent">
                      <Upload className="size-3.5" />
                      Enviar imagem
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          const okType =
                            f.type === "image/jpeg" ||
                            f.type === "image/png" ||
                            f.type === "image/webp";
                          if (!okType) {
                            toast.error("Use JPG, PNG ou WebP.");
                            return;
                          }
                          if (f.size > 5 * 1024 * 1024) {
                            toast.error("Imagem muito grande (máx. 5 MB).");
                            return;
                          }
                          setImagePreviewBlob((prev) => {
                            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                            return URL.createObjectURL(f);
                          });
                          setImageFile(f);
                        }}
                      />
                    </label>
                    {(imagePreviewBlob || form.image_url) && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setImagePreviewBlob((prev) => {
                            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                            return null;
                          });
                          setImageFile(null);
                          setForm((s) => ({ ...s, image_url: "" }));
                        }}
                      >
                        <Trash2 className="size-3.5" /> Remover
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG ou WebP · até 5 MB. Imagens antigas por URL continuam válidas até você trocar.
                  </p>
                  {(imagePreviewBlob || form.image_url) && (
                    <div className="overflow-hidden rounded-xl border border-border">
                      <img
                        src={imagePreviewBlob || form.image_url}
                        alt="Prévia do serviço"
                        className="h-32 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              {saveMutation.error && (
                <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {describeServiceSaveError(saveMutation.error)}
                </div>
              )}

              {editing?.id ? (
                <ServiceConsumablesEditor serviceId={editing.id} enabled={inventoryEnabled} />
              ) : null}
              </div>

              <DialogFooter className={adminMobileDialogFooterClass}>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saveMutation.isPending}>
                  Cancelar
                </Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {servicesQuery.isLoading &&
          Array.from({ length: 3 }).map((_, i) => <AdminServiceCardSkeleton key={`sk-${i}`} />)}
        {!servicesQuery.isLoading &&
          cards.map((s: any) => (
          <div key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:shadow-elegant">
            <div className="relative h-36">
              <img
                src={s.image_url ?? "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=60"}
                className="size-full object-cover"
                alt={s.name}
              />
              <span
                className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] ${
                  s.active ? "bg-success/90 text-background" : "bg-muted text-muted-foreground"
                }`}
              >
                {s.active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="p-5">
              <div className="text-xs text-gold uppercase tracking-wider">{s.category ?? "Serviço"}</div>
              <h3 className="mt-1 font-display text-lg">{s.name}</h3>
              {s.service_kind === "package" ? (
                <span className="mt-1 inline-block rounded-full bg-purple-soft/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-purple-soft">
                  Pacote · {s.package_sessions ?? "?"} sessões
                </span>
              ) : null}
              {s.require_anamnesis ? (
                <span className="mt-1 ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
                  Anamnese
                </span>
              ) : null}
              <p className="mt-1 text-sm text-muted-foreground">{s.description ?? "—"}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-medium">R$ {Number(s.price ?? 0).toFixed(2).replace(".", ",")}</span>
                <span className="text-xs text-muted-foreground">{s.duration_minutes ?? 0} min</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => beginEdit(s)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs hover:bg-accent"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
                <button
                  onClick={() => toggleMutation.mutate(s)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs hover:bg-accent"
                  disabled={toggleMutation.isPending}
                >
                  <Power className="size-3.5" /> {s.active ? "Desativar" : "Ativar"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!servicesQuery.isLoading && cards.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <AdminEmptyState
              icon={Scissors}
              title="Nenhum serviço cadastrado"
              description="Crie serviços com preço e duração para aparecerem na agenda e no link público de agendamento."
              action={
                <button
                  type="button"
                  onClick={beginCreate}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background"
                >
                  <Plus className="size-4" /> Novo serviço
                </button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
