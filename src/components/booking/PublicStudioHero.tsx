import { Clock, Instagram, MapPin, MessageCircle, Store } from "lucide-react";
import { BrandedImage } from "@/components/booking/BrandedImage";
import { PwaInstallTrigger } from "@/components/pwa/PwaInstallTrigger";
import { useMemo } from "react";
import {
  clampPercent,
  displayStudioName,
  formatInstagramHref,
  formatInstagramLabel,
  formatWhatsAppHref,
  formatWhatsAppLabel,
  normalizeHexColor,
  PUBLIC_BANNER_ASPECT_RATIO,
  studioInitials,
  type CompanyBranding,
  type CompanySummary,
} from "@/lib/branding-utils";

type PublicStudioHeroProps = {
  company: CompanySummary | null | undefined;
  branding: CompanyBranding | null | undefined;
  /** Slug público do salão — personaliza o app instalado pela cliente */
  slug?: string;
  onBookClick?: () => void;
};

export function PublicStudioHero({ company, branding, slug, onBookClick }: PublicStudioHeroProps) {
  const studioName = displayStudioName(company, branding);
  const primary = normalizeHexColor(branding?.primary_color, "#1a1a1a");
  const secondary = normalizeHexColor(branding?.secondary_color, "#c9a960");
  const logoPosX = clampPercent(branding?.logo_image_pos_x, 50);
  const logoPosY = clampPercent(branding?.logo_image_pos_y, 50);

  const instagramHref = formatInstagramHref(branding?.instagram_url);
  const whatsappHref = formatWhatsAppHref(branding?.whatsapp);
  const hasBanner = Boolean(branding?.banner_url?.trim());
  const hasLogo = Boolean(branding?.logo_url?.trim());

  const clientManifest = useMemo(
    () => ({
      profile: "client" as const,
      slug,
      appName: studioName,
      shortName: studioName,
      iconUrl: branding?.logo_url ?? undefined,
      themeColor: primary,
      backgroundColor: "#faf9f7",
    }),
    [slug, studioName, branding?.logo_url, primary],
  );

  const hours = branding?.public_hours_text?.trim() || null;
  const address = branding?.address?.trim() || null;

  return (
    <header className="public-booking-hero relative w-full animate-in fade-in duration-500">
      {/*
        Capa de referência ~{Math.round(PUBLIC_BANNER_ASPECT_RATIO * 100) / 100}:1 (1024×596):
        imagem INTEIRA, sem crop e sem overlay por cima do rodapé/textos da arte.
        Contato e CTA ficam ABAIXO da capa.
      */}
      {hasBanner ? (
        <div
          className="relative w-full overflow-hidden"
          style={{
            background: `linear-gradient(145deg, ${primary} 0%, ${secondary}66 50%, ${primary} 100%)`,
          }}
        >
          <BrandedImage
            src={branding!.banner_url!}
            alt={studioName}
            priority
            sizes="100vw"
            className="relative z-0 mx-auto block h-auto w-full max-w-full"
          />
        </div>
      ) : (
        <div
          className="relative isolate flex min-h-[52svh] w-full flex-col items-center justify-center overflow-hidden px-5 py-14 text-center sm:min-h-[56svh]"
          style={{
            background: `linear-gradient(145deg, ${primary} 0%, ${secondary}88 45%, ${primary}ee 100%)`,
          }}
        >
          <div className="mb-5 grid size-28 place-items-center overflow-hidden rounded-[1.75rem] border border-white/25 bg-white/95 p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] sm:size-36 md:size-40 md:rounded-[2rem] md:p-3">
            {hasLogo && branding?.logo_url ? (
              <BrandedImage
                src={branding.logo_url}
                alt={studioName}
                className="max-h-full max-w-full object-contain"
                style={{ objectPosition: `${logoPosX}% ${logoPosY}%` }}
                fallback={
                  <LogoFallback studioName={studioName} primary={primary} secondary={secondary} />
                }
              />
            ) : (
              <LogoFallback studioName={studioName} primary={primary} secondary={secondary} />
            )}
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-5xl md:text-6xl">
            {studioName}
          </h1>
          {branding?.slogan ? (
            <p className="mt-3 max-w-md text-base text-white/85 sm:text-lg">{branding.slogan}</p>
          ) : branding?.welcome_text ? (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
              {branding.welcome_text}
            </p>
          ) : (
            <p className="mt-3 text-base text-white/80">Beleza com presença</p>
          )}
          {onBookClick ? (
            <button
              type="button"
              onClick={onBookClick}
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full border border-[#d4af37]/70 bg-black/80 px-8 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition hover:bg-black"
            >
              Agendar agora
            </button>
          ) : null}
        </div>
      )}

      {/* Faixa de contato — abaixo da capa, nunca cobrindo a arte */}
      <div className="border-b border-border/60 bg-[#1a1410] px-3 py-2.5 text-center text-[11px] text-white/90 sm:text-xs">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          {instagramHref ? (
            <a
              href={instagramHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              <Instagram className="size-3.5 shrink-0 text-[#E4405F]" aria-hidden />
              {formatInstagramLabel(branding?.instagram_url)}
            </a>
          ) : null}
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              <MessageCircle className="size-3.5 shrink-0 fill-[#25D366] text-[#25D366]" aria-hidden />
              {formatWhatsAppLabel(branding?.whatsapp)}
            </a>
          ) : null}
          {slug ? (
            <PwaInstallTrigger
              manifest={clientManifest}
              label="Baixar app"
              variant="pill"
              primaryColor="#ffffff"
              className="!min-h-0 !border-white/30 !bg-white/10 !px-3 !py-1 !text-[11px] !text-white hover:!bg-white/20"
            />
          ) : null}
          {address ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 opacity-70" />
              {address}
            </span>
          ) : null}
          {hours ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 opacity-70" />
              {hours}
            </span>
          ) : null}
        </div>
      </div>

      {/* CTA abaixo da capa quando a arte já traz a marca */}
      {hasBanner && onBookClick ? (
        <div className="flex justify-center bg-[#f7f4ef] px-4 py-4">
          <button
            type="button"
            onClick={onBookClick}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d4af37]/70 bg-[#1a1a1a] px-8 text-sm font-medium text-white shadow-md transition hover:bg-black"
          >
            Agendar agora
          </button>
        </div>
      ) : null}
    </header>
  );
}

function LogoFallback({
  studioName,
  primary,
  secondary,
}: {
  studioName: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-1 text-white"
      style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
      aria-hidden
    >
      <Store className="size-10 opacity-90" strokeWidth={1.5} />
      <span className="font-display text-xl font-semibold">{studioInitials(studioName)}</span>
    </div>
  );
}

export function getBrandingButtonStyle(primary: string): React.CSSProperties {
  return { backgroundColor: primary, color: "#ffffff" };
}
