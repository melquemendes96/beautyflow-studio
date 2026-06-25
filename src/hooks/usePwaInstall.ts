import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyPwaManifest,
  isIosDevice,
  isPwaStandalone,
  registerPwaServiceWorker,
  type PwaManifestOptions,
} from "@/lib/pwa-install";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function usePwaInstall(options: PwaManifestOptions | null) {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [canNativeInstall, setCanNativeInstall] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const isIos = isIosDevice();

  useEffect(() => {
    setInstalled(isPwaStandalone());
    registerPwaServiceWorker();
  }, []);

  useEffect(() => {
    if (!options) return;
    applyPwaManifest(options);
  }, [options]);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setCanNativeInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanNativeInstall(false);
      deferredRef.current = null;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (options) {
      applyPwaManifest(options);
    }

    if (installed) return { ok: true as const, already: true };

    if (isIos) {
      setIosGuideOpen(true);
      return { ok: true as const, ios: true };
    }

    const deferred = deferredRef.current;
    if (!deferred) {
      setIosGuideOpen(true);
      return { ok: false as const, reason: "unavailable" as const };
    }

    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setCanNativeInstall(false);
      deferredRef.current = null;
      return { ok: true as const };
    }
    return { ok: false as const, reason: "dismissed" as const };
  }, [installed, isIos, options]);

  return {
    installed,
    canNativeInstall,
    isIos,
    iosGuideOpen,
    setIosGuideOpen,
    install,
  };
}
