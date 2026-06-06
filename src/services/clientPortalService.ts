import { getSupabase } from "@/lib/supabaseClient";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";

function normSlug(slug: string) {
  return normalizePublicBookingSlug(slug);
}

export const clientPortalService = {
  getPortalData(params: { slug: string; whatsapp: string }) {
    return getSupabase().rpc("get_client_portal_data", {
      p_slug: normSlug(params.slug),
      p_email: "",
      p_whatsapp: params.whatsapp,
    });
  },

  cancelAppointment(params: { slug: string; whatsapp: string; appointmentId: string }) {
    return getSupabase().rpc("client_cancel_appointment", {
      p_slug: normSlug(params.slug),
      p_email: "",
      p_whatsapp: params.whatsapp,
      p_appointment_id: params.appointmentId,
    });
  },

  rescheduleAppointment(params: {
    slug: string;
    whatsapp: string;
    appointmentId: string;
    newDate: string; // YYYY-MM-DD
    newTime: string; // HH:MM
  }) {
    return getSupabase().rpc("client_reschedule_appointment", {
      p_slug: normSlug(params.slug),
      p_email: "",
      p_whatsapp: params.whatsapp,
      p_appointment_id: params.appointmentId,
      p_new_date: params.newDate,
      p_new_time: params.newTime,
    });
  },

  submitRating(params: {
    slug: string;
    whatsapp: string;
    appointmentId: string;
    rating: number;
    comment?: string;
  }) {
    return getSupabase().rpc("client_submit_rating", {
      p_slug: normSlug(params.slug),
      p_email: "",
      p_whatsapp: params.whatsapp,
      p_appointment_id: params.appointmentId,
      p_rating: params.rating,
      p_comment: params.comment ?? null,
    });
  },
};

