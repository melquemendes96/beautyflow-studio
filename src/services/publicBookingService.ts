import { getSupabase } from "@/lib/supabaseClient";
import { parsePublicBookingRpcResult, type PublicBookingRpcResult } from "@/lib/appointment-time";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";

export type PublicBookingProvider = {
  id: string;
  display_name: string;
  photo_url: string | null;
  color: string | null;
  is_owner: boolean;
};

/**
 * Agendamento público (anon): usa RPCs com SECURITY DEFINER e validação por slug (Fase 3).
 * Não expõe company_id arbitrário no cliente.
 */
export const publicBookingService = {
  getPageData(slug: string) {
    const p_slug = normalizePublicBookingSlug(slug);
    return getSupabase().rpc("get_booking_page_data", { p_slug });
  },

  async listProviders(params: { slug: string; serviceId: string }) {
    const res = await getSupabase().rpc("list_public_providers", {
      p_slug: normalizePublicBookingSlug(params.slug),
      p_service_id: params.serviceId,
    });
    if (res.error) return res;
    return { ...res, data: (res.data ?? []) as PublicBookingProvider[] };
  },

  getAvailableSlots(params: {
    slug: string;
    serviceId: string;
    date: string;
    providerId?: string | null;
  }) {
    return getSupabase().rpc("get_available_slots", {
      p_slug: normalizePublicBookingSlug(params.slug),
      p_service_id: params.serviceId,
      p_date: params.date,
      p_provider_id: params.providerId ?? null,
    });
  },

  async createBooking(params: {
    slug: string;
    serviceId: string;
    appointmentDate: string;
    appointmentTime: string;
    clientName: string;
    clientWhatsapp: string;
    clientEmail?: string;
    notes?: string | null;
    whatsappNotifications?: boolean;
    providerId?: string | null;
    clientPackageId?: string | null;
  }) {
    const timeHm = params.appointmentTime.trim().slice(0, 5);
    const res = await getSupabase().rpc("create_public_booking", {
      p_slug: normalizePublicBookingSlug(params.slug),
      p_service_id: params.serviceId,
      p_appointment_date: params.appointmentDate,
      p_appointment_time: timeHm,
      p_client_name: params.clientName,
      p_client_email: params.clientEmail?.trim() ?? "",
      p_client_whatsapp: params.clientWhatsapp,
      p_notes: params.notes ?? null,
      p_whatsapp_notifications: params.whatsappNotifications ?? false,
      p_provider_id: params.providerId ?? null,
      p_client_package_id: params.clientPackageId ?? null,
    });
    if (res.error) return res;
    const parsed = parsePublicBookingRpcResult(res.data);
    return { ...res, data: parsed as PublicBookingRpcResult };
  },
};
