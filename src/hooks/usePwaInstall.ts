import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyPwaManifest,
  isIosDevice,
  isPwaStandalone,
  registerPwaServiceWorker,
  type PwaManifestOptions,
} from "@/lib/pwa-install";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  isAndroidDevice,
  isInAppBrowser,
  subscribeInstallPromptReady,
  triggerNativeInstallPrompt,
  waitForDeferredInstallPrompt,
} from "@/lib/pwa-install-prompt";

export type ManualInstallGuide = "ios" | "android" | "inapp" | null;

export function usePwaInstall(options: PwaManifestOptions | null) {
  const [installed, setInstalled] = useState(false);
  const [canNativeInstall, setCanNativeInstall] = useState(false);
  const [manualGuide, setManualGuide] = useState<ManualInstallGuide>(null);
  const [installing, setInstalling] = useState(false);
  const isIos = isIosDevice();
  const isAndroid = isAndroidDevice();
  const installAttemptRef = useRef(0);

  useEffect(() => {
    setInstalled(isPwaStandalone());
    registerPwaServiceWorker();
  }, []);

  useEffect(() => {
    if (!options) return;
    applyPwaManifest(options);
  }, [options]);

  useEffect(() => {
    const sync = () => {
      setCanNativeInstall(Boolean(getDeferredInstallPrompt()));
    };
    sync();
    return subscribeInstallPromptReady(sync);
  }, []);

  useEffect(() => {
    const onInstalled = () => {
      setInstalled(true);
      setCanNativeInstall(false);
      clearDeferredInstallPrompt();
      setManualGuide(null);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  const install = useCallback(async () => {
    const attempt = ++installAttemptRef.current;
    if (options) {
      applyPwaManifest(options);
    }

    if (installed) return { ok: true as const, already: true };

    if (isInAppBrowser()) {
      setManualGuide("inapp");
      return { ok: false as const, reason: "inapp_browser" as const };
    }

    if (isIos) {
      setManualGuide("ios");
      return { ok: true as const, ios: true };
    }

    setInstalling(true);
    try {
      let deferred = getDeferredInstallPrompt();
      if (!deferred) {
        deferred = await waitForDeferredInstallPrompt(2800);
      }

      if (attempt !== installAttemptRef.current) {
        return { ok: false as const, reason: "cancelled" as const };
      }

      if (deferred) {
        const outcome = await triggerNativeInstallPrompt(deferred);
        setCanNativeInstall(false);
        if (outcome === "accepted") {
          setInstalled(true);
          setManualGuide(null);
          return { ok: true as const, native: true };
        }
        return { ok: false as const, reason: "dismissed" as const };
      }

      if (isAndroid) {
        setManualGuide("android");
        return { ok: false as const, reason: "manual_android" as const };
      }

      setManualGuide("android");
      return { ok: false as const, reason: "unavailable" as const };
    } finally {
      setInstalling(false);
    }
  }, [installed, isIos, isAndroid, options]);

  return {
    installed,
    canNativeInstall,
    isIos,
    isAndroid,
    manualGuide,
    setManualGuide,
    installing,
    install,
  };
}
