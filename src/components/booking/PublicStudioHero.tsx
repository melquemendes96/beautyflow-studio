import { Instagram, MapPin, MessageCircle, Clock } from "lucide-react";
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
  const hasSocial = Boolean(instagramHref || whatsappHref);

  return (
    <>
      <div className="relative h-48 overflow-hidden md:h-64">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
        />
        {branding?.banner_url ? (
          <img
            src={branding.banner_url}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: `${bannerPosX}% ${bannerPosY}%` }}
          />
        ) : null}
      </div>

      <div className="container-page -mt-20 pb-2">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant md:p-8">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <div className="-mt-16 grid size-24 place-items-center overflow-hidden rounded-3xl border-4 border-background bg-background shadow-soft md:-mt-20 md:size-28">
              {branding?.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt={studioName}
                  className="size-full object-cover"
                  style={{ objectPosition: `${logoPosX}% ${logoPosY}%` }}
                />
              ) : (
                <div
                  className="grid size-full place-items-center font-display text-2xl font-semibold text-background md:text-3xl"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                  aria-hidden
                >
                  {studioInitials(studioName)}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl" style={{ color: primary }}>
                {studioName}
              </h1>
              {branding?.slogan ? (
                <p className="mt-1 text-sm text-muted-foreground">{branding.slogan}</p>
              ) : null}
            </div>
            {hasSocial ? (
              <div className="flex flex-wrap gap-2">
                {instagramHref ? (
                  <a
                    href={instagramHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-xs transition hover:bg-secondary/80"
                  >
                    <Instagram className="size-3.5 shrink-0" />
                    {formatInstagramLabel(branding?.instagram_url)}
                  </a>
                ) : null}
                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-success/15 px-3 py-2 text-xs text-success transition hover:bg-success/25"
                  >
                    <MessageCircle className="size-3.5 shrink-0" />
                    {formatWhatsAppLabel(branding?.whatsapp)}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          {branding?.welcome_text ? (
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {branding.welcome_text}
            </p>
          ) : null}

          {(branding?.address || branding?.public_hours_text) && (
            <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-4">
              {branding?.address ? (
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  {branding.address}
                </span>
              ) : null}
              {branding?.public_hours_text ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 shrink-0" />
                  {branding.public_hours_text}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function getBrandingButtonStyle(primary: string): React.CSSProperties {
  return { backgroundColor: primary, color: "#ffffff" };
}
