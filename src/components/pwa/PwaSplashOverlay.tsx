import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isPwaStandalone } from "@/lib/pwa-install";
import {
  PWA_SPLASH_FADE_MS,
  PWA_SPLASH_HOLD_MS,
  PWA_SPLASH_SESSION_KEY,
  preloadSplashImage,
  readStoredPwaProfile,
  resolveSplashLogoUrl,
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

    const stored = readStoredPwaProfile();
    const src = resolveSplashLogoUrl(stored?.iconUrl);
    setLogoUrl(src);

    let holdTimer: ReturnType<typeof window.setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof window.setTimeout> | undefined;
    let doneTimer: ReturnType<typeof window.setTimeout> | undefined;
    let cancelled = false;

    void preloadSplashImage(src).then(() => {
      if (cancelled) return;
      setPhase("enter");
      holdTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("hold");
      }, 180);
      fadeTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("fade");
      }, 180 + PWA_SPLASH_HOLD_MS);
      doneTimer = window.setTimeout(() => {
        if (cancelled) return;
        sessionStorage.setItem(PWA_SPLASH_SESSION_KEY, "1");
        setPhase("done");
        cleanupHtml();
      }, 180 + PWA_SPLASH_HOLD_MS + PWA_SPLASH_FADE_MS);
    });

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
    return <div className="fixed inset-0 z-[99999] bg-black" aria-hidden />;
  }

  const isFading = phase === "fade";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[99999] flex items-center justify-center bg-black",
        "transition-opacity ease-out",
        isFading ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${PWA_SPLASH_FADE_MS}ms` }}
      aria-hidden={isFading}
    >
      <img
        src={logoUrl}
        alt=""
        className={cn(
          "block max-h-[min(44vh,300px)] w-auto max-w-[min(90vw,360px)] object-contain px-6",
          phase === "enter" && "animate-pwa-splash-logo-in",
          (phase === "hold" || phase === "fade") && "opacity-100",
        )}
        decoding="sync"
        fetchPriority="high"
      />
    </div>
  );
}
