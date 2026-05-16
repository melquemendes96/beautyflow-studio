import { getSupabase } from "@/lib/supabaseClient";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";

/**
 * Agendamento público (anon): usa RPCs com SECURITY DEFINER e validação por slug (Fase 3).
 * Não expõe company_id arbitrário no cliente.
 */
export const publicBookingService = {
  getPageData(slug: string) {
    const p_slug = normalizePublicBookingSlug(slug);
    return getSupabase().rpc("get_booking_page_data", { p_slug });
  },

  getAvailableSlots(params: { slug: string; serviceId: string; date: string }) {
    return getSupabase().rpc("get_available_slots", {
      p_slug: normalizePublicBookingSlug(params.slug),
      p_service_id: params.serviceId,
      p_date: params.date,
    });
  },

  createBooking(params: {
    slug: string;
    serviceId: string;
    appointmentDate: string;
    appointmentTime: string;
    clientName: string;
    clientEmail: string;
    clientWhatsapp: string;
    notes?: string | null;
  }) {
    return getSupabase().rpc("create_public_booking", {
      p_slug: normalizePublicBookingSlug(params.slug),
      p_service_id: params.serviceId,
      p_appointment_date: params.appointmentDate,
      p_appointment_time: params.appointmentTime,
      p_client_name: params.clientName,
      p_client_email: params.clientEmail,
      p_client_whatsapp: params.clientWhatsapp,
      p_notes: params.notes ?? null,
    });
  },
};
