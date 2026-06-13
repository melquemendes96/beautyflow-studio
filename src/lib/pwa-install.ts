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

let manifestObjectUrl: string | null = null;

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

export function buildClientManifest(opts: PwaManifestOptions): Record<string, unknown> {
  const name = opts.appName?.trim() || "Meu salão";
  const short = truncateShortName(opts.shortName?.trim() || name, 14);
  const slug = opts.slug?.trim() || "";
  const startUrl = slug ? `/cliente?slug=${encodeURIComponent(slug)}` : "/cliente";
  const icon = absoluteIcon(opts.iconUrl);

  return {
    name: `${name} — Agendamentos`,
    short_name: short,
    description: `App de agendamentos — ${name}`,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: opts.backgroundColor || "#faf9f7",
    theme_color: opts.themeColor || "#1a1a1a",
    icons: [
      { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export function persistPwaProfile(profile: PwaProfile, slug?: string) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ profile, slug: slug ?? null }));
  } catch {
    /* ignore */
  }
}

export function applyPwaManifest(opts: PwaManifestOptions) {
  if (typeof document === "undefined") return;

  persistPwaProfile(opts.profile, opts.slug);

  let href: string;

  if (opts.profile === "client") {
    const manifest = buildClientManifest(opts);
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    if (manifestObjectUrl) URL.revokeObjectURL(manifestObjectUrl);
    manifestObjectUrl = URL.createObjectURL(blob);
    href = manifestObjectUrl;
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

  const theme = opts.themeColor || "#1a1a1a";
  let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    document.head.appendChild(themeMeta);
  }
  themeMeta.content = theme;

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
