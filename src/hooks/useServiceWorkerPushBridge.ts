import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { playPaymentNotificationSound, preloadNotificationSounds } from "@/lib/notification-sounds";

type PushBridgePayload = {
  kind?: string;
  title?: string;
  body?: string;
  url?: string;
};

/**
 * Quando o app está aberto, o service worker envia bf-push em vez de notificação de sistema.
 * Atualiza o feed do sino e toca som de pagamento.
 */
export function useServiceWorkerPushBridge(companyId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !companyId || !("serviceWorker" in navigator)) return;

    preloadNotificationSounds();

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: PushBridgePayload } | null;
      if (data?.type !== "bf-push") return;

      void queryClient.invalidateQueries({ queryKey: ["admin", "notification_feed", companyId] });

      if (data.payload?.kind === "payment") {
        playPaymentNotificationSound();
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [companyId, enabled, queryClient]);
}
