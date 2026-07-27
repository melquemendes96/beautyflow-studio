/**
 * Analytics híbrido: GA4 + Meta Pixel (ads) + eventos críticos no Supabase (Master).
 * IDs opcionais via .env — sem IDs, só persiste no banco o que for chamado via track*.
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export const GA4_MEASUREMENT_ID = (import.meta.env.VITE_GA4_MEASUREMENT_ID ?? "").trim();
export const META_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID ?? "").trim();

const UTM_STORAGE_KEY = "bf_marketing_utm_v1";
const SESSION_MARK_PREFIX = "bf_mkt_once_";

export type MarketingEventName =
  | "page_view"
  | "demo_view"
  | "whatsapp_click"
  | "signup_start"
  | "signup_complete"
  | "purchase";

export type MarketingUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export function captureMarketingAttributionFromUrl(search = typeof window !== "undefined" ? window.location.search : ""): MarketingUtm {
  const params = new URLSearchParams(search);
  const utm: MarketingUtm = {
    source: params.get("utm_source")?.trim() || undefined,
    medium: params.get("utm_medium")?.trim() || undefined,
    campaign: params.get("utm_campaign")?.trim() || undefined,
    content: params.get("utm_content")?.trim() || undefined,
    term: params.get("utm_term")?.trim() || undefined,
  };
  const hasAny = Object.values(utm).some(Boolean);
  if (hasAny && typeof window !== "undefined") {
    try {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
    } catch {
      /* ignore */
    }
  }
  return hasAny ? utm : getStoredMarketingUtm();
}

export function getStoredMarketingUtm(): MarketingUtm {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as MarketingUtm;
  } catch {
    return {};
  }
}

function markOnce(key: string): boolean {
  if (typeof window === "undefined") return true;
  const full = `${SESSION_MARK_PREFIX}${key}`;
  try {
    if (sessionStorage.getItem(full)) return false;
    sessionStorage.setItem(full, "1");
    return true;
  } catch {
    return true;
  }
}

function pushGtag(event: string, params?: Record<string, unknown>) {
  if (!GA4_MEASUREMENT_ID || typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event, params ?? {});
}

function pushMeta(event: string, params?: Record<string, unknown>) {
  if (!META_PIXEL_ID || typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", event, params ?? {});
}

async function persistFunnelEvent(
  eventName: Exclude<MarketingEventName, "page_view">,
  meta?: Record<string, unknown>,
) {
  if (!isSupabaseConfigured()) return;
  const utm = getStoredMarketingUtm();
  try {
    await getSupabase().rpc("track_marketing_event", {
      p_event_name: eventName,
      p_path: typeof window !== "undefined" ? window.location.pathname : null,
      p_utm_source: utm.source ?? null,
      p_utm_medium: utm.medium ?? null,
      p_utm_campaign: utm.campaign ?? null,
      p_utm_content: utm.content ?? null,
      p_utm_term: utm.term ?? null,
      p_metadata: meta ?? {},
      p_amount: typeof meta?.value === "number" ? meta.value : null,
      p_company_id: typeof meta?.company_id === "string" ? meta.company_id : null,
    });
  } catch {
    /* silencioso — analytics não deve quebrar UX */
  }
}

/** Eventos para ads (GA4/Meta) + opcionalmente banco. */
export function trackMarketingEvent(
  name: MarketingEventName,
  meta?: Record<string, unknown> & { persist?: boolean; oncePerSession?: boolean },
) {
  const { persist, oncePerSession, ...rest } = meta ?? {};
  if (oncePerSession && !markOnce(name)) return;

  const utm = getStoredMarketingUtm();
  const params = {
    ...rest,
    ...(utm.source ? { utm_source: utm.source } : {}),
    ...(utm.medium ? { utm_medium: utm.medium } : {}),
    ...(utm.campaign ? { utm_campaign: utm.campaign } : {}),
  };

  switch (name) {
    case "page_view":
      pushGtag("page_view", { page_path: rest.path ?? window.location.pathname, ...params });
      pushMeta("PageView");
      break;
    case "demo_view":
      pushGtag("view_demo", params);
      pushMeta("ViewContent", { content_name: "demo", content_category: "product" });
      break;
    case "whatsapp_click":
      pushGtag("whatsapp_click", params);
      pushMeta("Contact", { content_name: "whatsapp" });
      break;
    case "signup_start":
      pushGtag("sign_up", { method: "start", ...params });
      pushMeta("InitiateCheckout");
      break;
    case "signup_complete":
      pushGtag("sign_up", { method: "complete", ...params });
      pushMeta("CompleteRegistration");
      break;
    case "purchase":
      pushGtag("purchase", {
        currency: "BRL",
        value: typeof rest.value === "number" ? rest.value : undefined,
        ...params,
      });
      pushMeta("Purchase", {
        currency: "BRL",
        value: typeof rest.value === "number" ? rest.value : 0,
      });
      break;
  }

  const shouldPersist =
    persist === true ||
    name === "demo_view" ||
    name === "whatsapp_click" ||
    name === "signup_start" ||
    name === "signup_complete" ||
    name === "purchase";

  if (shouldPersist && name !== "page_view") {
    void persistFunnelEvent(name, rest);
  }
}

export function buildGa4BootstrapScript(measurementId: string): string {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:false});`;
}

export function buildMetaPixelBootstrapScript(pixelId: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');`;
}
