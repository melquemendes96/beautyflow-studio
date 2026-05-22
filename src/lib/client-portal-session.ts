import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";

const PORTAL_KEY = "bf_client_portal_session_v1";
const RESCHEDULE_KEY = "bf_reschedule_intent_v1";

export type ClientPortalSession = {
  slug: string;
  nome?: string;
  email?: string;
  whatsapp?: string;
};

export type RescheduleIntent = {
  appointmentId: string;
  slug: string;
  email: string;
  whatsapp: string;
  serviceId: string;
  clientName?: string;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveClientPortalSession(data: ClientPortalSession) {
  if (typeof sessionStorage === "undefined") return;
  const slug = normalizePublicBookingSlug(data.slug);
  if (!slug) return;
  sessionStorage.setItem(
    PORTAL_KEY,
    JSON.stringify({
      slug,
      nome: data.nome?.trim() || undefined,
      email: data.email?.trim() || undefined,
      whatsapp: data.whatsapp?.trim() || undefined,
    }),
  );
}

export function readClientPortalSession(): ClientPortalSession | null {
  if (typeof sessionStorage === "undefined") return null;
  const parsed = safeParse<ClientPortalSession>(sessionStorage.getItem(PORTAL_KEY));
  if (!parsed?.slug) return null;
  return {
    ...parsed,
    slug: normalizePublicBookingSlug(parsed.slug),
  };
}

export function saveRescheduleIntent(data: RescheduleIntent) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    RESCHEDULE_KEY,
    JSON.stringify({
      ...data,
      slug: normalizePublicBookingSlug(data.slug),
    }),
  );
}

export function readRescheduleIntent(): RescheduleIntent | null {
  if (typeof sessionStorage === "undefined") return null;
  const parsed = safeParse<RescheduleIntent>(sessionStorage.getItem(RESCHEDULE_KEY));
  if (!parsed?.appointmentId || !parsed.slug || !parsed.serviceId) return null;
  return { ...parsed, slug: normalizePublicBookingSlug(parsed.slug) };
}

export function clearRescheduleIntent() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(RESCHEDULE_KEY);
}
