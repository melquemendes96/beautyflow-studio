import { Clock, Instagram, MapPin, MessageCircle, Store } from "lucide-react";
import { BrandedImage } from "@/components/booking/BrandedImage";
import {
  clampPercent,
  displayStudioName,
  formatInstagramHref,
  formatInstagramLabel,
  formatWhatsAppHref,
  formatWhatsAppLabel,
  normalizeHexColor,
  studioInitials,
  type CompanyBranding,
  type CompanySummary,
} from "@/lib/branding-utils";

type PublicStudioHeroProps = {
  company: CompanySummary | null | undefined;
  branding: CompanyBranding | null | undefined;
};

export function PublicStudioHero({ company, branding }: PublicStudioHeroProps) {
  const studioName = displayStudioName(company, branding);
  const primary = normalizeHexColor(branding?.primary_color, "#1a1a1a");
  const secondary = normalizeHexColor(branding?.secondary_color, "#c9a960");
  const bannerPosX = clampPercent(branding?.banner_image_pos_x, 50);
  const bannerPosY = clampPercent(branding?.banner_image_pos_y, 50);
  const logoPosX = clampPercent(branding?.logo_image_pos_x, 50);
  const logoPosY = clampPercent(branding?.logo_image_pos_y, 50);

  const instagramHref = formatInstagramHref(branding?.instagram_url);
  const whatsappHref = formatWhatsAppHref(branding?.whatsapp);
  const hasBanner = Boolean(branding?.banner_url?.trim());
  const hasLogo = Boolean(branding?.logo_url?.trim());

  const socialButtons = (
    <div className="flex flex-wrap gap-2.5">
      {instagramHref ? (
        <a
          href={instagramHref}
          target="_blank"
          rel="noopener noreferrer"
          className="public-booking-pill public-booking-pill--muted inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2.5 text-sm transition"
        >
          <Instagram className="size-4 shrink-0 opacity-80" />
          <span className="font-medium">{formatInstagramLabel(branding?.instagram_url)}</span>
        </a>
      ) : null}
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="public-booking-pill public-booking-pill--whatsapp inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2.5 text-sm transition"
        >
          <MessageCircle className="size-4 shrink-0" />
          <span className="font-medium">{formatWhatsAppLabel(branding?.whatsapp)}</span>
        </a>
      ) : null}
    </div>
  );

  const metaBlock = (
    <div className="space-y-3">
      {branding?.welcome_text ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
          {branding.welcome_text}
        </p>
      ) : null}
      {(branding?.address || branding?.public_hours_text) && (
        <div className="flex flex-col gap-2.5 text-sm text-muted-foreground">
          {branding?.address ? (
            <span className="inline-flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 opacity-70" />
              <span>{branding.address}</span>
            </span>
          ) : null}
          {branding?.public_hours_text ? (
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 shrink-0 opacity-70" />
              <span>{branding.public_hours_text}</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="public-booking-hero mx-auto w-full max-w-[1400px] px-4 pt-5 pb-2 md:px-6 md:pt-7 animate-in fade-in slide-in-from-bottom-3 duration-500"
    >
      <div className="overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-[0_10px_48px_-16px_rgba(0,0,0,0.14)]">
        {/* Banner — separado da logo */}
        <div className="relative aspect-[21/7] min-h-[132px] w-full overflow-hidden rounded-t-[28px] sm:min-h-[148px] md:aspect-[21/6] md:min-h-[172px]">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 55%, ${primary}dd 100%)`,
            }}
            aria-hidden
          />
          {hasBanner ? (
            <BrandedImage
              src={branding!.banner_url!}
              alt=""
              className="absolute inset-0 size-full object-cover"
              style={{ objectPosition: `${bannerPosX}% ${bannerPosY}%` }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5" />
        </div>

        <div className="p-5 md:p-8 lg:p-9">
          {/* Desktop: logo 220px | informações */}
          <div className="hidden md:grid md:grid-cols-[220px_minmax(0,1fr)] md:items-start md:gap-8 lg:gap-10">
            <LogoTile
              hasLogo={hasLogo}
              logoUrl={branding?.logo_url}
              studioName={studioName}
              primary={primary}
              secondary={secondary}
              logoPosX={logoPosX}
              logoPosY={logoPosY}
              variant="desktop"
            />
            <div className="min-w-0 space-y-4 pt-1">
              <div>
                <h1
                  className="font-display text-[2rem] font-bold leading-tight tracking-tight lg:text-[2.35rem]"
                  style={{ color: primary }}
                >
                  {studioName}
                </h1>
                {branding?.slogan ? (
                  <p className="mt-2 text-base text-muted-foreground/90">{branding.slogan}</p>
                ) : null}
              </div>
              {socialButtons}
              {metaBlock}
            </div>
          </div>

          {/* Mobile: [logo 60px] [nome] */}
          <div className="md:hidden">
            <div className="flex items-start gap-3.5">
              <LogoTile
                hasLogo={hasLogo}
                logoUrl={branding?.logo_url}
                studioName={studioName}
                primary={primary}
                secondary={secondary}
                logoPosX={logoPosX}
                logoPosY={logoPosY}
                variant="mobile"
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <h1
                  className="font-display text-[22px] font-bold leading-snug tracking-tight"
                  style={{ color: primary }}
                >
                  {studioName}
                </h1>
                {branding?.slogan ? (
                  <p className="mt-1 text-sm text-muted-foreground">{branding.slogan}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {socialButtons}
              {metaBlock}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoTile({
  hasLogo,
  logoUrl,
  studioName,
  primary,
  secondary,
  logoPosX,
  logoPosY,
  variant,
}: {
  hasLogo: boolean;
  logoUrl?: string | null;
  studioName: string;
  primary: string;
  secondary: string;
  logoPosX: number;
  logoPosY: number;
  variant: "desktop" | "mobile";
}) {
  const isDesktop = variant === "desktop";

  return (
    <div
      className={
        isDesktop
          ? "grid size-[220px] shrink-0 place-items-center overflow-hidden rounded-[24px] border border-border/40 bg-white p-3 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.12)]"
          : "grid size-[60px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/40 bg-white p-1 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]"
      }
    >
      {hasLogo && logoUrl ? (
        <BrandedImage
          src={logoUrl}
          alt={studioName}
          className={isDesktop ? "max-h-full max-w-full object-contain" : "size-full object-contain"}
          style={{ objectPosition: `${logoPosX}% ${logoPosY}%` }}
          fallback={
            <LogoPlaceholder studioName={studioName} primary={primary} secondary={secondary} compact={!isDesktop} />
          }
        />
      ) : (
        <LogoPlaceholder studioName={studioName} primary={primary} secondary={secondary} compact={!isDesktop} />
      )}
    </div>
  );
}

function LogoPlaceholder({
  studioName,
  primary,
  secondary,
  compact,
}: {
  studioName: string;
  primary: string;
  secondary: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        className="grid size-full place-items-center rounded-xl text-background"
        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
        aria-hidden
      >
        <Store className="size-6 opacity-90" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center" aria-hidden>
      <div
        className="grid size-16 place-items-center rounded-2xl text-background shadow-inner"
        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
      >
        <Store className="size-8 opacity-90" strokeWidth={1.5} />
      </div>
      <span className="font-display text-lg font-semibold" style={{ color: primary }}>
        {studioInitials(studioName)}
      </span>
    </div>
  );
}

export function getBrandingButtonStyle(primary: string): React.CSSProperties {
  return { backgroundColor: primary, color: "#ffffff" };
}
