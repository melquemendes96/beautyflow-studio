import { useCallback, useEffect, useState } from "react";
import { registerPwaServiceWorker } from "@/lib/pwa-install";
import {
  getWebPushPermission,
  isWebPushSupported,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/web-push";
import { pushService } from "@/services/pushService";

type UseWebPushOptions = {
  companyId: string | null;
  enabled?: boolean;
  profile?: "admin" | "staff" | "master";
};

export function useWebPush({ companyId, enabled = true, profile = "admin" }: UseWebPushOptions) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);
  const supported = isWebPushSupported();

  useEffect(() => {
    registerPwaServiceWorker();
    setPermission(getWebPushPermission());
  }, []);

  useEffect(() => {
    if (!enabled || !supported || !companyId) return;
    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    });
  }, [enabled, supported, companyId]);

  useEffect(() => {
    if (!enabled || !companyId || !supported) return;
    const tick = () => {
      void pushService.requestOutboxDelivery(20);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, companyId, supported]);

  const subscribe = useCallback(async () => {
    if (!companyId) return { ok: false as const, error: "no_company" };
    setPending(true);
    try {
      const res = await subscribeWebPush(companyId, profile);
      if (!res.ok) {
        setPermission(getWebPushPermission());
        return res;
      }
      const save = await pushService.upsertSubscription({
        endpoint: res.subscription.endpoint,
        p256dh: res.subscription.p256dh,
        auth: res.subscription.auth,
        companyId: res.subscription.companyId,
        profile: res.subscription.profile,
        userAgent: res.subscription.userAgent,
      });
      if (save.error) {
        return { ok: false as const, error: "save_failed" };
      }
      setSubscribed(true);
      setPermission("granted");
      return { ok: true as const };
    } finally {
      setPending(false);
    }
  }, [companyId, profile]);

  const unsubscribe = useCallback(async () => {
    setPending(true);
    try {
      const res = await unsubscribeWebPush();
      if (res.endpoint) {
        await pushService.deleteSubscription(res.endpoint);
      }
      setSubscribed(false);
      return { ok: true as const };
    } finally {
      setPending(false);
    }
  }, []);

  return {
    supported,
    permission,
    subscribed,
    pending,
    subscribe,
    unsubscribe,
  };
}
