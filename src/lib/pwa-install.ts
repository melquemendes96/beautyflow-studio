import { normalizePublicBookingSlug, isValidPublicBookingSlug } from "@/lib/public-booking-slug";

export type PwaProfile = "client" | "admin" | "staff" | "master";

export type PwaManifestOptions = {
  profile: PwaProfile;
  slug?: string;
  appName?: string;
  shortName?: string;
  iconUrl?: string;
  themeColor?: string;
  backgroundColor?: string;
};

const STATIC_MANIFEST: Record<Exclude<PwaProfile, "client">, string> = {
  admin: "/pwa/manifest-admin.webmanifest",
  staff: "/pwa/manifest-staff.webmanifest",
  master: "/pwa/manifest-master.webmanifest",
};

const PROFILE_STORAGE_KEY = "bf_pwa_profile_v1";

function truncateShortName(name: string, max = 12): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function absoluteIcon(iconUrl: string | undefined): string {
  const fallback = "/logo-beautyflow.png";
  const raw = (iconUrl?.trim() || fallback).split("?")[0];
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (typeof window === "undefined") return raw;
  return `${window.location.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

/** URL do manifest estático por salão (iOS respeita melhor que blob). */
export function getClientManifestHref(slug: string): string {
  const normalized = normalizePublicBookingSlug(slug);
  return `/pwa/manifest-client/${encodeURIComponent(normalized)}.webmanifest`;
}

export function buildClientManifest(opts: PwaManifestOptions): Record<string, unknown> {
  const name = opts.appName?.trim() || "Meu salão";
  const short = truncateShortName(opts.shortName?.trim() || name, 14);
  const slug = normalizePublicBookingSlug(opts.slug ?? "");
  const startUrl = slug && isValidPublicBookingSlug(slug) ? `/agendar/${encodeURIComponent(slug)}` : "/";
  const localIcon = typeof window !== "undefined" ? `${window.location.origin}/logo-beautyflow.png` : "/logo-beautyflow.png";
  const brandIcon = absoluteIcon(opts.iconUrl);

  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [
    { src: localIcon, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: localIcon, sizes: "512x512", type: "image/png", purpose: "any" },
  ];
  if (brandIcon !== localIcon && brandIcon.startsWith("http")) {
    icons.push({ src: brandIcon, sizes: "512x512", type: "image/png", purpose: "any" });
  }

  return {
    ...(slug && isValidPublicBookingSlug(slug) ? { id: `/pwa/client/${slug}` } : {}),
    name: `${name} — Agendamentos`,
    short_name: short,
    description: `Agende horários em ${name}`,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: opts.backgroundColor || "#000000",
    theme_color: opts.themeColor || "#000000",
    icons,
  };
}

export function persistPwaProfile(profile: PwaProfile, slug?: string, iconUrl?: string) {
  try {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ profile, slug: slug ?? null, iconUrl: iconUrl?.trim() || null }),
    );
  } catch {
    /* ignore */
  }
}

export function applyPwaManifest(opts: PwaManifestOptions) {
  if (typeof document === "undefined") return;

  persistPwaProfile(opts.profile, opts.slug, opts.iconUrl);

  let href: string;

  if (opts.profile === "client" && opts.slug && isValidPublicBookingSlug(normalizePublicBookingSlug(opts.slug))) {
    href = getClientManifestHref(opts.slug);
  } else if (opts.profile === "client") {
    href = getClientManifestHref("exemplo");
  } else {
    href = STATIC_MANIFEST[opts.profile];
  }

  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = href;

  const icon = absoluteIcon(opts.iconUrl);
  let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!apple) {
    apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    document.head.appendChild(apple);
  }
  apple.href = icon;

  let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    document.head.appendChild(themeMeta);
  }
  themeMeta.content = opts.themeColor || "#000000";

  let appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!appleTitle) {
    appleTitle = document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    document.head.appendChild(appleTitle);
  }
  appleTitle.content =
    opts.profile === "client"
      ? truncateShortName(opts.shortName?.trim() || opts.appName || "Salão", 14)
      : opts.profile === "master"
        ? "Master"
        : opts.profile === "staff"
          ? "Equipe"
          : "Admin";
}

export function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    /* silencioso — PWA ainda pode instalar em alguns browsers */
  });
}

export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function getPwaInstallLabel(isIos: boolean): string {
  return isIos ? "Instalar na tela inicial" : "Baixar app";
}
