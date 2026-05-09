import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Logo } from "@/components/brand/Logo";
import { Instagram, MapPin, Upload } from "lucide-react";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandingService } from "@/services/brandingService";
import { toast } from "sonner";
import { AdminBrandingFormSkeleton, AdminBrandingPreviewSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/admin/branding")({
  validateSearch: (s: Record<string, unknown>) => ({
    onboarding: typeof s.onboarding === "string" ? s.onboarding : undefined,
  }),
  component: Branding,
});

function Branding() {
  const queryClient = useQueryClient();
  const { onboarding } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { companyId, hasCompany } = useCurrentCompany();

  useEffect(() => {
    if (onboarding !== "1") return;
    toast.message("Personalize sua página com a identidade da sua marca. Depois configure a agenda e cadastre serviços.");
    void navigate({ to: "/admin/branding", search: { onboarding: undefined }, replace: true });
  }, [onboarding, navigate]);

  const brandingQuery = useQuery({
    queryKey: ["admin", "branding", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await brandingService.getByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const [b, setB] = useState({
    nome: "",
    slogan: "",
    boasVindas: "",
    cor: "#1a1a1a",
    cor2: "#c9a960",
    instagram: "",
    whatsapp: "",
    endereco: "",
  });

  // sincroniza quando carregar (sem sobrescrever edição local)
  useEffect(() => {
    if (!brandingQuery.data) return;
    const d: any = brandingQuery.data;
    setB((prev) => {
      // se já foi preenchido pelo usuário, não sobreescreve
      if (prev.nome || prev.slogan || prev.boasVindas) return prev;
      return {
        nome: d.brand_name ?? "",
        slogan: d.slogan ?? "",
        boasVindas: d.welcome_text ?? "",
        cor: d.primary_color ?? "#1a1a1a",
        cor2: d.secondary_color ?? "#c9a960",
        instagram: d.instagram_url ?? "",
        whatsapp: d.whatsapp ?? "",
        endereco: d.address ?? "",
      };
    });
  }, [brandingQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await brandingService.upsert(companyId, {
        brand_name: b.nome.trim() || null,
        slogan: b.slogan.trim() || null,
        welcome_text: b.boasVindas.trim() || null,
        primary_color: b.cor,
        secondary_color: b.cor2,
        instagram_url: b.instagram.trim() || null,
        whatsapp: b.whatsapp.trim() || null,
        address: b.endereco.trim() || null,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "branding", companyId] });
      toast.success("Marca salva com sucesso");
    },
  });

  return (
    <div>
      <PageTitle title="Aparência da marca" subtitle="Veja como sua página de agendamento ficará para suas clientes." />

      {brandingQuery.isError && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os dados da marca. Tente atualizar a página.
        </div>
      )}

      {brandingQuery.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminBrandingFormSkeleton />
          <div className="lg:sticky lg:top-24">
            <div className="mb-2 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Pré-visualização ao vivo
            </div>
            <AdminBrandingPreviewSkeleton />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form */}
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
            <Field label="Nome comercial" value={b.nome} onChange={(v) => setB({ ...b, nome: v })} />
            <Field label="Slogan" value={b.slogan} onChange={(v) => setB({ ...b, slogan: v })} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Upload2 label="Logo" />
              <Upload2 label="Imagem de capa / banner" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField label="Cor principal" value={b.cor} onChange={(v) => setB({ ...b, cor: v })} />
              <ColorField label="Cor secundária" value={b.cor2} onChange={(v) => setB({ ...b, cor2: v })} />
            </div>

            <Field label="Texto de boas-vindas" value={b.boasVindas} onChange={(v) => setB({ ...b, boasVindas: v })} multiline />
            <Field label="Instagram" value={b.instagram} onChange={(v) => setB({ ...b, instagram: v })} />
            <Field label="WhatsApp" value={b.whatsapp} onChange={(v) => setB({ ...b, whatsapp: v })} />
            <Field label="Endereço" value={b.endereco} onChange={(v) => setB({ ...b, endereco: v })} />

            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full rounded-full bg-foreground py-3 text-sm text-background disabled:opacity-60"
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-24">
            <div className="mb-2 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Pré-visualização ao vivo
            </div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elegant">
              <div className="h-32 bg-gradient-to-br" style={{ backgroundImage: `linear-gradient(135deg, ${b.cor}, ${b.cor2})` }} />
              <div className="p-6">
                <div className="-mt-14 mb-4 grid size-20 place-items-center rounded-2xl border-4 border-background bg-background shadow-soft">
                  <Logo className="h-12" />
                </div>
                <h3 className="font-display text-xl" style={{ color: b.cor }}>{b.nome}</h3>
                <p className="text-sm text-muted-foreground">{b.slogan}</p>
                <p className="mt-3 text-sm">{b.boasVindas}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Instagram className="size-3" /> {b.instagram}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {b.endereco}</span>
                </div>
                <button
                  type="button"
                  className="mt-5 w-full rounded-full py-3 text-sm text-background"
                  style={{ backgroundColor: b.cor }}
                >
                  Agendar horário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-foreground" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground" />
      )}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-input bg-background p-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-9 cursor-pointer rounded-lg border-none bg-transparent" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
      </div>
    </label>
  );
}

function Upload2({ label }: { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="grid h-24 cursor-pointer place-items-center rounded-xl border border-dashed border-border bg-secondary/40 text-xs text-muted-foreground hover:bg-secondary">
        <div className="flex flex-col items-center gap-1">
          <Upload className="size-4" />
          Clique para enviar
        </div>
      </div>
    </label>
  );
}
