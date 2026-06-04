import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Plus, Pencil, Power, Scissors, Trash2, Upload } from "lucide-react";
import { AdminEmptyState, AdminServiceCardSkeleton } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { serviceService } from "@/services/serviceService";
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
  });

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
      if (!companyId) throw new Error("Sem empresa");

      let image_url: string | null = form.image_url.trim() || null;
      if (imageFile) {
        const { publicUrl, error } = await uploadCompanyImage(companyId, "service", imageFile, {
          serviceId: editing?.id,
        });
        if (error) throw error;
        image_url = publicUrl ?? null;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        price: Number(form.price),
        duration_minutes: Number(form.duration_minutes),
        buffer_minutes: Number(form.buffer_minutes),
        image_url,
        active: Boolean(form.active),
      };
      if (!payload.name) throw new Error("Nome obrigatório");
      if (!Number.isFinite(payload.price)) throw new Error("Preço inválido");
      if (!Number.isFinite(payload.duration_minutes)) throw new Error("Duração inválida");
      if (!Number.isFinite(payload.buffer_minutes)) throw new Error("Buffer inválido");

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
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "services", companyId] });
      toast.success("Serviço salvo com sucesso");
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
                  Não foi possível salvar. Verifique os campos e tente novamente.
                </div>
              )}
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
