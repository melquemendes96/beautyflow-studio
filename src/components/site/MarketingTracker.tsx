import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  captureMarketingAttributionFromUrl,
  trackMarketingEvent,
} from "@/lib/marketing-analytics";

/** Captura UTM e dispara page_view / eventos de rota para GA4+Meta (+ banco nos críticos). */
export function MarketingTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });

  useEffect(() => {
    captureMarketingAttributionFromUrl(search);
  }, [search]);

  useEffect(() => {
    trackMarketingEvent("page_view", { path: pathname });

    if (pathname === "/demo" || pathname.startsWith("/demo/")) {
      trackMarketingEvent("demo_view", { oncePerSession: true });
    }
    if (pathname === "/cadastro" || pathname.startsWith("/cadastro")) {
      trackMarketingEvent("signup_start", { oncePerSession: true });
    }
  }, [pathname]);

  return null;
}
