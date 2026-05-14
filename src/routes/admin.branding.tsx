import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Logo } from "@/components/brand/Logo";
import { Instagram, MapPin, Upload, X } from "lucide-react";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandingService } from "@/services/brandingService";
import { toast } from "sonner";
import { AdminBrandingFormSkeleton, AdminBrandingPreviewSkeleton } from "@/components/admin/AdminPageStates";
import { uploadCompanyImage } from "@/lib/company-media-upload";

function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function clampDrag(n: number): number {
  return Math.min(100, Math.max(0, n));
}

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
    logo_url: "",
    banner_url: "",
    banner_image_pos_x: 50,
    banner_image_pos_y: 50,
    logo_image_pos_x: 50,
    logo_image_pos_y: 50,
  });

  // sincroniza quando carregar (sem sobrescrever edição local)
  useEffect(() => {
    if (!brandingQuery.data) return;
    const d = brandingQuery.data as Record<string, unknown>;
    setB((prev) => {
      const framing = {
        banner_image_pos_x: clampPercent(d.banner_image_pos_x, 50),
        banner_image_pos_y: clampPercent(d.banner_image_pos_y, 50),
        logo_image_pos_x: clampPercent(d.logo_image_pos_x, 50),
        logo_image_pos_y: clampPercent(d.logo_image_pos_y, 50),
      };
      // se já foi preenchido pelo usuário, não sobreescreve texto; enquadramento vem do servidor
      if (prev.nome || prev.slogan || prev.boasVindas) {
        return { ...prev, ...framing };
      }
      return {
        nome: String(d.brand_name ?? ""),
        slogan: String(d.slogan ?? ""),
        boasVindas: String(d.welcome_text ?? ""),
        cor: String(d.primary_color ?? "#1a1a1a"),
        cor2: String(d.secondary_color ?? "#c9a960"),
        instagram: String(d.instagram_url ?? ""),
        whatsapp: String(d.whatsapp ?? ""),
        endereco: String(d.address ?? ""),
        logo_url: String(d.logo_url ?? ""),
        banner_url: String(d.banner_url ?? ""),
        ...framing,
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
        logo_url: b.logo_url.trim() || null,
        banner_url: b.banner_url.trim() || null,
        banner_image_pos_x: b.banner_image_pos_x,
        banner_image_pos_y: b.banner_image_pos_y,
        logo_image_pos_x: b.logo_image_pos_x,
        logo_image_pos_y: b.logo_image_pos_y,
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
              <BrandAssetUpload
                label="Logo"
                companyId={companyId}
                url={b.logo_url}
                kind="logo"
                onChangeUrl={(logo_url) =>
                  setB((prev) => ({
                    ...prev,
                    logo_url,
                    logo_image_pos_x: 50,
                    logo_image_pos_y: 50,
                  }))
                }
                disabled={!hasCompany}
              />
              <BrandAssetUpload
                label="Imagem de capa / banner"
                companyId={companyId}
                url={b.banner_url}
                kind="banner"
                onChangeUrl={(banner_url) =>
                  setB((prev) => ({
                    ...prev,
                    banner_url,
                    banner_image_pos_x: 50,
                    banner_image_pos_y: 50,
                  }))
                }
                disabled={!hasCompany}
              />
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
            <div className="mb-2 space-y-1 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Pré-visualização ao vivo</div>
              <p className="text-[11px] text-muted-foreground">
                Com logo ou capa: arraste na área para enquadrar (margens fixas do cartão).
              </p>
            </div>
              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elegant">
              <PreviewBannerStrip
                bannerUrl={b.banner_url}
                gradient={`linear-gradient(135deg, ${b.cor}, ${b.cor2})`}
                pos={{ x: b.banner_image_pos_x, y: b.banner_image_pos_y }}
                onPosChange={(p) =>
                  setB((s) => ({ ...s, banner_image_pos_x: p.x, banner_image_pos_y: p.y }))
                }
              />
              <div className="p-6">
                <div className="-mt-14 mb-4 size-20 shrink-0">
                  <PreviewLogoAvatar
                    logoUrl={b.logo_url}
                    pos={{ x: b.logo_image_pos_x, y: b.logo_image_pos_y }}
                    onPosChange={(p) =>
                      setB((s) => ({ ...s, logo_image_pos_x: p.x, logo_image_pos_y: p.y }))
                    }
                  />
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

function BrandAssetUpload({
  label,
  companyId,
  url,
  kind,
  onChangeUrl,
  disabled,
}: {
  label: string;
  companyId: string | null;
  url: string;
  kind: "logo" | "banner";
  onChangeUrl: (url: string) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !companyId) {
      if (!companyId) toast.error("Associe-se a uma empresa para enviar imagens.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Envie apenas imagem (JPEG, PNG, WebP ou GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 5 MB).");
      return;
    }
    setBusy(true);
    const { publicUrl, error } = await uploadCompanyImage(companyId, kind, file);
    setBusy(false);
    if (error || !publicUrl) {
      toast.error(error?.message ?? "Não foi possível enviar. Verifique se o bucket Storage foi criado no Supabase.");
      return;
    }
    onChangeUrl(publicUrl);
    toast.success("Imagem enviada.");
  };

  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <label
        htmlFor={inputId}
        className={`grid min-h-24 cursor-pointer place-items-center rounded-xl border border-dashed border-border bg-secondary/40 px-2 py-3 text-center text-xs text-muted-foreground hover:bg-secondary ${
          busy || disabled ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => void onPick(e)}
          disabled={disabled || busy || !companyId}
        />
        <div className="flex flex-col items-center gap-1">
          <Upload className="size-4 shrink-0" />
          {busy ? "Enviando…" : url ? "Clique para trocar" : "Clique para enviar"}
        </div>
      </label>
      {url ? (
        <div
          className={
            kind === "logo"
              ? "relative mt-2 mx-auto block w-fit max-w-full"
              : "relative mt-2 w-full"
          }
        >
          <button
            type="button"
            className="absolute right-1 top-1 z-10 rounded-full bg-background/95 p-1.5 text-muted-foreground shadow-md ring-1 ring-border transition hover:bg-destructive/15 hover:text-destructive"
            aria-label="Remover imagem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChangeUrl("");
              toast.message("Imagem removida. Salve as alterações para atualizar a página pública.");
            }}
          >
            <X className="size-4" />
          </button>
          <img
            src={url}
            alt=""
            className={`rounded-lg border border-border object-cover ${kind === "logo" ? "mx-auto size-20" : "max-h-28 w-full"}`}
          />
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG, WebP ou GIF · até 5 MB</p>
    </div>
  );
}

type FramingPos = { x: number; y: number };

/** Faixa de capa na pré-visualização: arrastar para ajustar background-position (%). */
function PreviewBannerStrip({
  bannerUrl,
  gradient,
  pos,
  onPosChange,
}: {
  bannerUrl: string;
  gradient: string;
  pos: FramingPos;
  onPosChange: (p: FramingPos) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bannerUrl.trim()) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current || !bannerUrl.trim()) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    const w = Math.max(r.width, 1);
    const h = Math.max(r.height, 1);
    const nx = clampDrag(drag.current.px - (dx / w) * 100);
    const ny = clampDrag(drag.current.py - (dy / h) * 100);
    onPosChange({ x: nx, y: ny });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const hasBanner = Boolean(bannerUrl.trim());

  return (
    <div
      ref={ref}
      className={`relative h-32 overflow-hidden ${hasBanner ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={!hasBanner ? { backgroundImage: gradient } : undefined}
    >
      {hasBanner ? (
        <div
          className="pointer-events-none absolute inset-0 bg-cover select-none"
          style={{
            backgroundImage: `url(${bannerUrl})`,
            backgroundPosition: `${pos.x}% ${pos.y}%`,
          }}
        />
      ) : null}
    </div>
  );
}

/** Avatar da logo na pré-visualização: arrastar para object-position (%). */
function PreviewLogoAvatar({
  logoUrl,
  pos,
  onPosChange,
}: {
  logoUrl: string;
  pos: FramingPos;
  onPosChange: (p: FramingPos) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!logoUrl.trim()) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current || !logoUrl.trim()) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    const w = Math.max(r.width, 1);
    const h = Math.max(r.height, 1);
    const nx = clampDrag(drag.current.px - (dx / w) * 100);
    const ny = clampDrag(drag.current.py - (dy / h) * 100);
    onPosChange({ x: nx, y: ny });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const hasLogo = Boolean(logoUrl.trim());

  return (
    <div
      ref={ref}
      className={`grid size-20 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-background shadow-soft ${
        hasLogo ? "touch-none cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {hasLogo ? (
        <img
          src={logoUrl}
          alt=""
          className="pointer-events-none size-full select-none object-cover"
          style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
        />
      ) : (
        <Logo className="h-12" />
      )}
    </div>
  );
}
