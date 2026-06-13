import type { PwaProfile } from "@/lib/pwa-install";

export const PWA_SPLASH_HOLD_MS = 550;
export const PWA_SPLASH_FADE_MS = 650;
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

export function resolveSplashLogoUrl(iconUrl?: string | null): string {
  const raw = iconUrl?.trim();
  if (!raw) return PWA_PLATFORM_SPLASH_LOGO;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (typeof window === "undefined") return raw.startsWith("/") ? raw : `/${raw}`;
  return `${window.location.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
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
