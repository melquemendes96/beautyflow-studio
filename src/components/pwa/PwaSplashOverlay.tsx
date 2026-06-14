import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isPwaStandalone } from "@/lib/pwa-install";
import {
  PWA_SPLASH_ENTER_MS,
  PWA_SPLASH_FADE_MS,
  PWA_SPLASH_HOLD_MS,
  PWA_SPLASH_SESSION_KEY,
  preloadSplashImage,
  readStoredPwaProfile,
  resolveSplashLogoUrlAsync,
} from "@/lib/pwa-splash";

type Phase = "loading" | "enter" | "hold" | "fade" | "done";

export function PwaSplashOverlay() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanupHtml = () => {
      document.documentElement.classList.remove("bf-pwa-splash-pending");
      document.documentElement.style.removeProperty("background-color");
    };

    if (!isPwaStandalone() || sessionStorage.getItem(PWA_SPLASH_SESSION_KEY)) {
      setPhase("done");
      cleanupHtml();
      return;
    }

    let holdTimer: ReturnType<typeof window.setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof window.setTimeout> | undefined;
    let doneTimer: ReturnType<typeof window.setTimeout> | undefined;
    let cancelled = false;

    void (async () => {
      const stored = readStoredPwaProfile();
      const src = await resolveSplashLogoUrlAsync(stored);
      if (cancelled) return;

      setLogoUrl(src);
      await preloadSplashImage(src);
      if (cancelled) return;

      setPhase("enter");
      holdTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("hold");
      }, PWA_SPLASH_ENTER_MS);
      fadeTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("fade");
      }, PWA_SPLASH_ENTER_MS + PWA_SPLASH_HOLD_MS);
      doneTimer = window.setTimeout(() => {
        if (cancelled) return;
        sessionStorage.setItem(PWA_SPLASH_SESSION_KEY, "1");
        setPhase("done");
        cleanupHtml();
      }, PWA_SPLASH_ENTER_MS + PWA_SPLASH_HOLD_MS + PWA_SPLASH_FADE_MS);
    })();

    return () => {
      cancelled = true;
      if (holdTimer) window.clearTimeout(holdTimer);
      if (fadeTimer) window.clearTimeout(fadeTimer);
      if (doneTimer) window.clearTimeout(doneTimer);
      cleanupHtml();
    };
  }, []);

  if (phase === "done") {
    return null;
  }

  if (phase === "loading" || !logoUrl) {
    return (
      <div
        className="fixed inset-0 z-[99999] bg-black"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-hidden
      />
    );
  }

  const isFading = phase === "fade";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[99999] flex items-center justify-center bg-black",
        "transition-opacity ease-out",
        isFading ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      style={{
        transitionDuration: `${PWA_SPLASH_FADE_MS}ms`,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      aria-hidden={isFading}
    >
      <div className="flex max-h-full max-w-full items-center justify-center px-8 py-10">
        <img
          src={logoUrl}
          alt=""
          className={cn(
            "block h-auto w-auto max-h-[min(52dvh,340px)] max-w-[min(88vw,380px)] object-contain",
            phase === "enter" && "animate-pwa-splash-logo-in",
          )}
          decoding="sync"
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
