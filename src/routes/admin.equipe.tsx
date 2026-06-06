import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Calendar, Copy, Link2, Plus, Pencil, Trash2, Upload, UserRound } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { teamService, type ServiceProviderRow } from "@/services/teamService";
import { serviceService } from "@/services/serviceService";
import {
  formatProviderInviteError,
  providerInviteService,
} from "@/services/providerInviteService";
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
  adminMobileDialogBodyClass,
  adminMobileDialogContentClass,
  adminMobileDialogFooterClass,
  adminMobileDialogHeaderClass,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/equipe")({
  component: Equipe,
});

const PRESET_COLORS = ["#1a1a1a", "#c9a960", "#7c3aed", "#2563eb", "#059669", "#dc2626"];

function accessStatusLabel(status?: ServiceProviderRow["access_status"]) {
  switch (status) {
    case "active":
      return "Acesso ativo";
    case "invite_pending":
      return "Convite pendente";
    case "suspended":
      return "Suspenso";
    default:
      return "Sem acesso";
  }
}

function accessStatusClass(status?: ServiceProviderRow["access_status"]) {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "invite_pending":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "suspended":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function buildInviteUrl(token: string) {
  if (typeof window === "undefined") return `/convite/prestador/${token}`;
  return `${window.location.origin}/convite/prestador/${token}`;
}

function isAllowedProviderImage(file: File): boolean {
  if (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp" ||
    file.type === "image/gif"
  ) {
    return true;
  }
  if (file.type && !file.type.startsWith("image/")) return false;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif";
}

function Equipe() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();
  const pickingFileRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceProviderRow | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewBlob, setImagePreviewBlob] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    photo_url: "",
    color: PRESET_COLORS[0],
    is_owner: false,
    active: true,
    default_commission_pct: "",
    service_ids: [] as string[],
  });

  useEffect(() => {
    const onWindowFocus = () => {
      window.setTimeout(() => {
        pickingFileRef.current = false;
      }, 300);
    };
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, []);

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
  const slotLimit = teamQuery.data?.slot_limit ?? 0;

  useEffect(() => {
    if (!editing?.id) return;
    const fresh = providers.find((p: ServiceProviderRow) => p.id === editing.id);
    if (fresh) setEditing(fresh);
  }, [providers, editing?.id]);

  const activeCount = teamQuery.data?.active_count ?? 0;
  const services = servicesQuery.data ?? [];
  const slotsLoaded = teamQuery.isSuccess;
  const canAdd = slotsLoaded && slotLimit > 0 && activeCount < slotLimit;
  const slotsFull = slotsLoaded && slotLimit > 0 && activeCount >= slotLimit;
  const slotsMisconfigured = slotsLoaded && slotLimit <= 0;

  const clearImagePreview = () => {
    setImagePreviewBlob((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
  };

  const resetForm = () => {
    setEditing(null);
    clearImagePreview();
    setInviteEmail("");
    setGeneratedInviteUrl(null);
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
    clearImagePreview();
    setGeneratedInviteUrl(null);
    setInviteEmail(p.invited_email ?? p.linked_user_email ?? "");
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
      if (
        !window.confirm(
          "Remover este prestador? O acesso ao painel será revogado imediatamente. Agendamentos antigos permanecem no histórico.",
        )
      ) {
        throw new Error("cancelled");
      }
      const res = await teamService.delete(companyId, id);
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean };
      if (!payload?.ok) throw new Error("Erro ao remover");
    },
    onSuccess: async () => {
      toast.success("Prestador removido");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: (e: Error) => {
      if (e.message === "cancelled") return;
      toast.error("Erro ao remover prestador");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (providerId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await providerInviteService.createInvite(companyId, providerId, inviteEmail || null);
      if (res.error) throw res.error;
      if (!res.data?.ok || !res.data.token) {
        throw new Error(formatProviderInviteError(res.data?.error));
      }
      return buildInviteUrl(res.data.token);
    },
    onSuccess: async (url) => {
      setGeneratedInviteUrl(url);
      toast.success("Link de convite gerado.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao gerar convite"),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (providerId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await providerInviteService.cancelInvite(companyId, providerId);
      if (res.error) throw res.error;
    },
    onSuccess: async () => {
      setGeneratedInviteUrl(null);
      toast.message("Convite cancelado.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: () => toast.error("Erro ao cancelar convite"),
  });

  const suspendMutation = useMutation({
    mutationFn: async (providerId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await providerInviteService.suspendAccess(companyId, providerId);
      if (res.error) throw res.error;
      const data = res.data as { ok?: boolean; error?: string };
      if (data?.ok === false) throw new Error(formatProviderInviteError(data.error));
    },
    onSuccess: async () => {
      toast.success("Acesso suspenso.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao suspender"),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (providerId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await providerInviteService.reactivateAccess(companyId, providerId);
      if (res.error) throw res.error;
      const data = res.data as { ok?: boolean; error?: string };
      if (data?.ok === false) throw new Error(formatProviderInviteError(data.error));
    },
    onSuccess: async () => {
      toast.success("Prestador reativado. Gere um novo convite para liberar o painel.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao reativar"),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (providerId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await providerInviteService.unlinkUser(companyId, providerId);
      if (res.error) throw res.error;
      const data = res.data as { ok?: boolean; error?: string };
      if (data?.ok === false) throw new Error(formatProviderInviteError(data.error));
    },
    onSuccess: async () => {
      setGeneratedInviteUrl(null);
      toast.success("Conta desvinculada.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "team", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao desvincular"),
  });

  const accessBusy =
    inviteMutation.isPending ||
    cancelInviteMutation.isPending ||
    suspendMutation.isPending ||
    reactivateMutation.isPending ||
    unlinkMutation.isPending;

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name)),
    [providers],
  );

  const photoPreviewSrc = imagePreviewBlob || form.photo_url || null;

  const onPickProviderPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickingFileRef.current = false;
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!isAllowedProviderImage(f)) {
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
  };

  return (
    <div>
      <PageTitle
        title="Equipe"
        subtitle={
          teamQuery.isLoading
            ? "Carregando limite de vagas…"
            : slotsMisconfigured
              ? `Prestadores bookáveis no link público (${activeCount}/0 — limite a corrigir)`
              : `Gerencie prestadores bookáveis no link público (${activeCount}/${slotLimit} vagas ativas).`
        }
        action={
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && pickingFileRef.current) return;
              setOpen(nextOpen);
              if (!nextOpen) resetForm();
            }}
          >
            <Button
              type="button"
              disabled={!canAdd}
              className="gap-2"
              onClick={() => {
                if (!canAdd) return;
                resetForm();
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Novo prestador
            </Button>
            <DialogContent
              className={adminMobileDialogContentClass}
              onInteractOutside={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
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
                <div className="grid gap-2 text-sm">
                  <span>Foto</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => {
                        pickingFileRef.current = true;
                      }}
                    >
                      <Upload className="size-4" />
                      Enviar
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={onPickProviderPhoto}
                      />
                    </label>
                    {photoPreviewSrc ? (
                      <img
                        key={photoPreviewSrc}
                        src={photoPreviewSrc}
                        alt="Prévia do prestador"
                        className="size-16 shrink-0 rounded-full border-2 border-emerald-500 object-cover shadow-sm"
                      />
                    ) : (
                      <div className="grid size-16 shrink-0 place-items-center rounded-full border border-dashed border-border bg-muted text-muted-foreground">
                        <UserRound className="size-6" />
                      </div>
                    )}
                    {photoPreviewSrc ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          clearImagePreview();
                          setForm((s) => ({ ...s, photo_url: "" }));
                        }}
                      >
                        <Trash2 className="size-3.5" /> Remover
                      </button>
                    ) : null}
                  </div>
                  {imageFile ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Imagem selecionada: {imageFile.name}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">JPG, PNG ou WebP · até 5 MB.</p>
                </div>
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
                {editing?.id ? (
                  <div className="grid gap-3 rounded-xl border border-border bg-secondary/20 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">Acesso ao painel</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${accessStatusClass(editing.access_status)}`}
                      >
                        {accessStatusLabel(editing.access_status)}
                      </span>
                    </div>
                    {editing.access_status === "active" ? (
                      <p className="text-xs text-muted-foreground">
                        Vinculado a <strong>{editing.linked_user_email ?? "conta ativa"}</strong>
                        {editing.linked_at
                          ? ` · desde ${new Date(editing.linked_at).toLocaleDateString("pt-BR")}`
                          : ""}
                      </p>
                    ) : editing.access_status === "invite_pending" ? (
                      <p className="text-xs text-muted-foreground">
                        Convite pendente
                        {editing.invite_expires_at
                          ? ` · expira em ${new Date(editing.invite_expires_at).toLocaleDateString("pt-BR")}`
                          : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Gere um link para o prestador criar login e ver só a própria agenda.
                      </p>
                    )}
                    {editing.access_status !== "active" && editing.access_status !== "suspended" ? (
                      <label className="grid gap-1.5">
                        <span className="text-xs text-muted-foreground">E-mail do prestador (recomendado)</span>
                        <Input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="profissional@email.com"
                        />
                      </label>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {editing.access_status !== "active" && editing.access_status !== "suspended" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          disabled={accessBusy}
                          onClick={() => inviteMutation.mutate(editing.id)}
                        >
                          <Link2 className="size-3.5" />
                          Gerar link
                        </Button>
                      ) : null}
                      {editing.access_status === "invite_pending" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={accessBusy}
                          onClick={() => cancelInviteMutation.mutate(editing.id)}
                        >
                          Cancelar convite
                        </Button>
                      ) : null}
                      {editing.access_status === "active" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={accessBusy}
                            onClick={() => unlinkMutation.mutate(editing.id)}
                          >
                            Desvincular conta
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={accessBusy}
                            onClick={() => suspendMutation.mutate(editing.id)}
                          >
                            Suspender acesso
                          </Button>
                        </>
                      ) : null}
                      {editing.access_status === "suspended" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={accessBusy}
                          onClick={() => reactivateMutation.mutate(editing.id)}
                        >
                          Reativar perfil
                        </Button>
                      ) : null}
                      {editing.access_status === "active" ? (
                        <Button type="button" size="sm" variant="outline" className="gap-1.5" asChild>
                          <Link to="/admin/agenda" search={{ provider: editing.id }}>
                            <Calendar className="size-3.5" /> Ver agenda
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                    {generatedInviteUrl ? (
                      <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Link válido por 7 dias (anterior invalidado):</p>
                        <code className="break-all text-xs">{generatedInviteUrl}</code>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => {
                              void navigator.clipboard.writeText(generatedInviteUrl);
                              toast.success("Link copiado.");
                            }}
                          >
                            <Copy className="size-3.5" /> Copiar
                          </Button>
                          <Button type="button" size="sm" variant="outline" asChild>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`Olá! Acesse seu painel JM BeautyFlow por este link (válido 7 dias): ${generatedInviteUrl}`)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Enviar WhatsApp
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                    Salve o prestador primeiro. Depois, em <strong>Editar</strong>, você gera o link de convite para
                    o painel individual.
                  </p>
                )}
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
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                >
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

      {teamQuery.isError ? (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar a equipe. Confirme que a migration de Equipe foi aplicada no Supabase e que
          seu usuário é owner/admin.
          <button
            type="button"
            className="mt-2 block text-xs underline"
            onClick={() => void teamQuery.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {slotsMisconfigured ? (
        <div className="mt-6 rounded-2xl border border-gold/40 bg-gold-soft/30 px-4 py-3 text-sm">
          <p className="font-medium">Limite de prestadores indisponível (0 vagas)</p>
          <p className="mt-1 text-muted-foreground">
            O plano Elite inclui <strong>3 prestadores</strong> no agendamento online, mas o limite no banco está
            zerado. Aplique a migration{" "}
            <code className="text-xs">20260602000000_fix_provider_slot_limit.sql</code> no Supabase ou peça ao
            suporte para ajustar <code className="text-xs">included_provider_slots</code> do plano Elite.
          </p>
        </div>
      ) : null}

      {slotsFull ? (
        <div className="mt-6 rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm">
          <p className="font-medium">Todas as vagas estão em uso ({activeCount}/{slotLimit})</p>
          <p className="mt-1 text-muted-foreground">
            O Elite inclui 3 prestadores. Vagas extras (R$ 17/mês cada) ainda serão contratadas pelo{" "}
            <Link to="/admin/plano" className="underline hover:text-foreground">
              Plano e assinatura
            </Link>{" "}
            — por enquanto, solicite pelo suporte na página de plano.
          </p>
        </div>
      ) : null}

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
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${accessStatusClass(p.access_status)}`}
                    >
                      {accessStatusLabel(p.access_status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(p.service_ids?.length ?? 0) > 0
                      ? `${p.service_ids.length} serviço(s)`
                      : "Nenhum serviço vinculado"}
                    {p.linked_user_email ? ` · ${p.linked_user_email}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(p)}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                {p.access_status === "active" ? (
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link to="/admin/agenda" search={{ provider: p.id }}>
                      <Calendar className="size-3.5" /> Agenda
                    </Link>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(p.id)}
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
