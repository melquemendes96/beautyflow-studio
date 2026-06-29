/** Captura global do beforeinstallprompt (Chrome/Android) — não perder o evento antes do React. */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __bfDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

const INSTALL_READY_EVENT = "bf-install-ready";

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__bfDeferredInstallPrompt ?? null;
}

export function clearDeferredInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.__bfDeferredInstallPrompt = null;
}

export function captureDeferredInstallPrompt(e: Event): void {
  e.preventDefault();
  if (typeof window === "undefined") return;
  window.__bfDeferredInstallPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event(INSTALL_READY_EVENT));
}

export function subscribeInstallPromptReady(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(INSTALL_READY_EVENT, handler);
  return () => window.removeEventListener(INSTALL_READY_EVENT, handler);
}

/** Deve rodar o mais cedo possível (script inline no HTML). */
export const PWA_INSTALL_CAPTURE_SCRIPT = `(function(){try{if(typeof window==="undefined")return;window.__bfDeferredInstallPrompt=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__bfDeferredInstallPrompt=e;window.dispatchEvent(new Event("bf-install-ready"));});}catch(e){}})();`;

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** WebView do Instagram/WhatsApp etc. — não dispara install nativo. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Line\/|Twitter|WhatsApp|wv\)/i.test(ua);
}

export function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Chrome|CriOS|EdgA/i.test(ua) && !/Instagram|FBAN|FBAV/i.test(ua);
}

export async function waitForDeferredInstallPrompt(timeoutMs = 2500): Promise<BeforeInstallPromptEvent | null> {
  const existing = getDeferredInstallPrompt();
  if (existing) return existing;

  return new Promise((resolve) => {
    const done = (value: BeforeInstallPromptEvent | null) => {
      clearTimeout(timer);
      unsub();
      resolve(value);
    };

    const unsub = subscribeInstallPromptReady(() => {
      done(getDeferredInstallPrompt());
    });

    const timer = window.setTimeout(() => done(getDeferredInstallPrompt()), timeoutMs);
  });
}

export async function triggerNativeInstallPrompt(
  deferred: BeforeInstallPromptEvent,
): Promise<"accepted" | "dismissed"> {
  await deferred.prompt();
  const choice = await deferred.userChoice;
  if (choice.outcome === "accepted") {
    clearDeferredInstallPrompt();
  }
  return choice.outcome;
}
