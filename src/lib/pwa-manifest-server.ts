import { normalizePublicBookingSlug, isValidPublicBookingSlug } from "@/lib/public-booking-slug";

const MANIFEST_PREFIX = "/pwa/manifest-client/";

function truncateShortName(name: string, max = 12): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function absoluteIcon(origin: string, iconUrl: string | null | undefined): string {
  const fallback = "/logo-beautyflow.png";
  const raw = (iconUrl?.trim() || fallback).split("?")[0];
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function parseClientManifestSlug(pathname: string): string | null {
  if (!pathname.startsWith(MANIFEST_PREFIX)) return null;
  const rest = pathname.slice(MANIFEST_PREFIX.length);
  const slugPart = rest.endsWith(".webmanifest") ? rest.slice(0, -".webmanifest".length) : rest;
  const slug = normalizePublicBookingSlug(decodeURIComponent(slugPart));
  if (!slug || !isValidPublicBookingSlug(slug)) return null;
  return slug;
}

export function buildClientManifestJson(opts: {
  slug: string;
  origin: string;
  appName: string;
  iconUrl?: string | null;
  themeColor?: string | null;
}): Record<string, unknown> {
  const slug = normalizePublicBookingSlug(opts.slug);
  const name = opts.appName.trim() || "Meu salão";
  const short = truncateShortName(name, 14);
  const startUrl = `/agendar/${encodeURIComponent(slug)}`;
  const localIcon = `${opts.origin}/logo-beautyflow.png`;
  const brandIcon = opts.iconUrl?.trim() ? absoluteIcon(opts.origin, opts.iconUrl) : null;

  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [
    { src: localIcon, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: localIcon, sizes: "512x512", type: "image/png", purpose: "any" },
  ];
  if (brandIcon && brandIcon !== localIcon && brandIcon.startsWith("https://")) {
    icons.push({ src: brandIcon, sizes: "512x512", type: "image/png", purpose: "any" });
  }

  return {
    id: `/pwa/client/${slug}`,
    name: `${name} — Agendamentos`,
    short_name: short,
    description: `Agende horários em ${name}`,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#000000",
    theme_color: opts.themeColor?.trim() || "#000000",
    icons,
  };
}

async function fetchBookingBranding(slug: string): Promise<{
  appName: string;
  iconUrl: string | null;
  themeColor: string | null;
} | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/get_booking_page_data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ p_slug: slug }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown> | null;
  if (!data || data.ok === false) return null;

  const company = data.company as Record<string, unknown> | undefined;
  const branding = data.branding as Record<string, unknown> | undefined;
  const brandName = typeof branding?.brand_name === "string" ? branding.brand_name.trim() : "";
  const companyName = typeof company?.name === "string" ? company.name.trim() : "";
  const appName = brandName || companyName || "Salão";

  const logoUrl = typeof branding?.logo_url === "string" ? branding.logo_url : null;
  const primary =
    typeof branding?.primary_color === "string" && /^#[0-9A-Fa-f]{6}$/.test(branding.primary_color)
      ? branding.primary_color
      : null;

  return { appName, iconUrl: logoUrl, themeColor: primary };
}

export async function tryServeClientManifest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const slug = parseClientManifestSlug(url.pathname);
  if (!slug) return null;

  const branding = await fetchBookingBranding(slug);
  const origin = url.origin;
  const manifest = buildClientManifestJson({
    slug,
    origin,
    appName: branding?.appName ?? slug,
    iconUrl: branding?.iconUrl,
    themeColor: branding?.themeColor,
  });

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
