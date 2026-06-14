import type { PwaProfile } from "@/lib/pwa-install";
import { persistPwaProfile } from "@/lib/pwa-install";
import { publicBookingService } from "@/services/publicBookingService";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";

export const PWA_SPLASH_HOLD_MS = 550;
export const PWA_SPLASH_FADE_MS = 650;
export const PWA_SPLASH_ENTER_MS = 180;
export const PWA_SPLASH_SESSION_KEY = "bf_pwa_splash_done_v1";
export const PWA_PLATFORM_SPLASH_LOGO = "/logo-jm-splash.png";

export type StoredPwaProfile = {
  profile: PwaProfile;
  slug?: string | null;
  iconUrl?: string | null;
};

export function readStoredPwaProfile(): StoredPwaProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("bf_pwa_profile_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPwaProfile;
    if (!parsed?.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function inferSlugFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("slug")?.trim();
    if (fromQuery) return normalizePublicBookingSlug(fromQuery);
    const match = window.location.pathname.match(/^\/agendar\/([^/]+)/i);
    if (match?.[1]) return normalizePublicBookingSlug(decodeURIComponent(match[1]));
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveSplashLogoUrl(iconUrl?: string | null): string {
  const raw = iconUrl?.trim();
  if (!raw) return PWA_PLATFORM_SPLASH_LOGO;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (typeof window === "undefined") return raw.startsWith("/") ? raw : `/${raw}`;
  return `${window.location.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

async function fetchPublicSalonLogo(slug: string): Promise<string | null> {
  try {
    const { data, error } = await publicBookingService.getPageData(slug);
    if (error || !data) return null;
    const branding = (data as { branding?: { logo_url?: string | null } | null }).branding;
    const logo = branding?.logo_url?.trim();
    return logo || null;
  } catch {
    return null;
  }
}

/** Resolve logo do splash: storage → slug público → logo da plataforma. */
export async function resolveSplashLogoUrlAsync(stored: StoredPwaProfile | null): Promise<string> {
  if (stored?.iconUrl?.trim()) {
    return resolveSplashLogoUrl(stored.iconUrl);
  }

  const slug = stored?.slug?.trim() || inferSlugFromLocation();
  if (slug) {
    const remoteLogo = await fetchPublicSalonLogo(slug);
    if (remoteLogo) {
      if (stored?.profile) {
        persistPwaProfile(stored.profile, slug, remoteLogo);
      }
      return resolveSplashLogoUrl(remoteLogo);
    }
  }

  return PWA_PLATFORM_SPLASH_LOGO;
}

export function preloadSplashImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export const PWA_SPLASH_INIT_SCRIPT = `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||(window.navigator.standalone===true);if(!s||sessionStorage.getItem('${PWA_SPLASH_SESSION_KEY}'))return;document.documentElement.style.backgroundColor='#000000';document.documentElement.classList.add('bf-pwa-splash-pending');}catch(e){}})();`;
