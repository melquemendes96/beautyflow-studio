import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Plus, Pencil, Trash2, Upload, UserRound } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { teamService, type ServiceProviderRow } from "@/services/teamService";
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

export const Route = createFileRoute("/admin/equipe")({
  component: Equipe,
});

const PRESET_COLORS = ["#1a1a1a", "#c9a960", "#7c3aed", "#2563eb", "#059669", "#dc2626"];

function Equipe() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceProviderRow | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    photo_url: "",
    color: PRESET_COLORS[0],
    is_owner: false,
    active: true,
    default_commission_pct: "",
    service_ids: [] as string[],
  });

  const teamQuery = useQuery({
    queryKey: ["admin", "team", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await teamService.list(companyId!);
      if (res.error) throw res.error;
      if (!res.data?.ok) throw new Error(res.data?.error ?? "Erro ao carregar equipe");
      return res.data;
    },
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

  const providers = teamQuery.data?.providers ?? [];
  const slotLimit = teamQuery.data?.slot_limit ?? 3;
  const activeCount = teamQuery.data?.active_count ?? 0;
  const services = servicesQuery.data ?? [];

  const resetForm = () => {
    setEditing(null);
    setImageFile(null);
    setForm({
      display_name: "",
      photo_url: "",
      color: PRESET_COLORS[0],
      is_owner: false,
      active: true,
      default_commission_pct: "",
      service_ids: services.map((s: { id: string }) => s.id),
    });
  };

  const openEdit = (p: ServiceProviderRow) => {
    setEditing(p);
    setForm({
      display_name: p.display_name,
      photo_url: p.photo_url ?? "",
      color: p.color ?? PRESET_COLORS[0],
      is_owner: p.is_owner,
      active: p.active,
      default_commission_pct: p.default_commission_pct != null ? String(p.default_commission_pct) : "",
      service_ids: p.service_ids ?? [],
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      if (!form.display_name.trim()) throw new Error("Nome obrigatório");

      let photo_url = form.photo_url.trim() || null;
      if (imageFile) {
        const { publicUrl, error } = await uploadCompanyImage(companyId, "provider", imageFile, {
          providerId: editing?.id,
        });
        if (error) throw error;
        photo_url = publicUrl;
      }

      const commission = form.default_commission_pct.trim()
        ? Number(form.default_commission_pct)
        : null;
      if (form.default_commission_pct.trim() && !Number.isFinite(commission)) {
        throw new Error("Comissão inválida");
      }

      const res = await teamService.upsert(companyId, {
        providerId: editing?.id ?? null,
        displayName: form.display_name.trim(),
        photoUrl: photo_url,
        color: form.color,
        isOwner: form.is_owner,
        active: form.active,
        defaultCommissionPct: commission,
        serviceIds: form.service_ids,
      });
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean; error?: string; slot_limit?: number };
      if (!payload?.ok) {
        if (payload?.error === "limite_prestadores") {
          throw new Error(`Limite de ${payload.slot_limit ?? slotLimit} prestadores ativos atingido.`);
        }
        throw new Error(payload?.error ?? "Erro ao salvar");
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Prestador atualizado" : "Prestador adicionado");
      setOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar prestador"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await teamService.delete(companyId, id);
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean };
      if (!payload?.ok) throw new Error("Erro ao remover");
    },
    onSuccess: async () => {
      toast.success("Prestador removido");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: () => toast.error("Erro ao remover prestador"),
  });

  const canAdd = activeCount < slotLimit;

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name)),
    [providers],
  );

  return (
    <div>
      <PageTitle
        title="Equipe"
        subtitle={`Gerencie prestadores bookáveis no link público (${activeCount}/${slotLimit} vagas ativas).`}
        action={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
              else if (!editing) {
                setForm((f) => ({
                  ...f,
                  service_ids: services.map((s: { id: string }) => s.id),
                }));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={!canAdd} className="gap-2">
                <Plus className="size-4" /> Novo prestador
              </Button>
            </DialogTrigger>
            <DialogContent className={adminMobileDialogContentClass}>
              <DialogHeader className={adminMobileDialogHeaderClass}>
                <DialogTitle>{editing ? "Editar prestador" : "Novo prestador"}</DialogTitle>
                <DialogDescription>
                  Nome, foto e serviços que este profissional atende no agendamento online.
                </DialogDescription>
              </DialogHeader>
              <div className={`grid gap-4 ${adminMobileDialogBodyClass}`}>
                <label className="grid gap-1.5 text-sm">
                  Nome exibido
                  <Input
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Ex.: Joyce Mendes"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  Foto
                  <div className="flex items-center gap-3">
                    {form.photo_url ? (
                      <img src={form.photo_url} alt="" className="size-14 rounded-full object-cover" />
                    ) : (
                      <div className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
                        <UserRound className="size-6" />
                      </div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <Upload className="size-4" />
                      Enviar
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </label>
                <div className="grid gap-1.5 text-sm">
                  Cor na agenda
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`size-8 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setForm({ ...form, color: c })}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <label className="grid gap-1.5 text-sm">
                  Comissão padrão (%)
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.default_commission_pct}
                    onChange={(e) => setForm({ ...form, default_commission_pct: e.target.value })}
                    placeholder="Opcional"
                  />
                </label>
                <div className="grid gap-2 text-sm">
                  <span>Serviços atendidos</span>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-3">
                    {services.map((s: { id: string; name: string }) => {
                      const checked = form.service_ids.includes(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm({
                                ...form,
                                service_ids: checked
                                  ? form.service_ids.filter((id) => id !== s.id)
                                  : [...form.service_ids, s.id],
                              });
                            }}
                          />
                          {s.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_owner}
                    onChange={(e) => setForm({ ...form, is_owner: e.target.checked })}
                  />
                  Dono(a) do studio (conta como 1 vaga)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Ativo no agendamento online
                </label>
              </div>
              <DialogFooter className={adminMobileDialogFooterClass}>
                <Button variant="outline" onClick={() => setOpen(false)}>
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

      {teamQuery.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Carregando equipe…</p>
      ) : sortedProviders.length === 0 ? (
        <AdminEmptyState
          className="mt-8"
          icon={UserRound}
          title="Nenhum prestador cadastrado"
          description="Adicione profissionais para que clientes escolham quem vai atender no link público."
        />
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedProviders.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start gap-4">
                {p.photo_url ? (
                  <img src={p.photo_url} alt="" className="size-14 rounded-full object-cover" />
                ) : (
                  <div
                    className="grid size-14 place-items-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: p.color ?? "#1a1a1a" }}
                  >
                    {p.display_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{p.display_name}</h3>
                    {p.is_owner ? (
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
                        Dono(a)
                      </span>
                    ) : null}
                    {!p.active ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        Inativo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(p.service_ids?.length ?? 0) > 0
                      ? `${p.service_ids.length} serviço(s)`
                      : "Nenhum serviço vinculado"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(p)}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Remover ${p.display_name}?`)) deleteMutation.mutate(p.id);
                  }}
                >
                  <Trash2 className="size-3.5" /> Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
