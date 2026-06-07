import { getSupabase } from "@/lib/supabaseClient";

/**
 * Agendamentos (`appointments` + `company_id`).
 */
export const appointmentService = {
  listByCompanyAndDate(companyId: string, date: string) {
    return getSupabase()
      .from("appointments")
      .select("*, client:clients(name,email,whatsapp), service:services(name,duration_minutes,buffer_minutes), provider:service_providers(display_name,color,photo_url)")
      .eq("company_id", companyId)
      .eq("appointment_date", date)
      .order("appointment_time");
  },

  listByCompanyForRange(companyId: string, startDate: string, endDate: string) {
    return getSupabase()
      .from("appointments")
      .select("*, client:clients(name,email,whatsapp), service:services(name,duration_minutes,buffer_minutes), provider:service_providers(display_name,color,photo_url)")
      .eq("company_id", companyId)
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .order("appointment_date")
      .order("appointment_time");
  },

  listByCompanyForRangeLite(companyId: string, startDate: string, endDate: string) {
    return getSupabase()
      .from("appointments")
      .select("appointment_date,appointment_time,status,service_id")
      .eq("company_id", companyId)
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .order("appointment_date")
      .order("appointment_time");
  },

  create(
    companyId: string,
    input: {
      client_id: string;
      service_id: string;
      appointment_date: string;
      appointment_time: string;
      provider_id?: string | null;
    },
  ) {
    return getSupabase()
      .from("appointments")
      .insert({
        company_id: companyId,
        client_id: input.client_id,
        service_id: input.service_id,
        appointment_date: input.appointment_date,
        appointment_time: input.appointment_time,
        provider_id: input.provider_id ?? null,
        status: "scheduled",
      })
      .select("*, client:clients(name,email,whatsapp), service:services(name,duration_minutes,buffer_minutes), provider:service_providers(display_name,color,photo_url)")
      .single();
  },

  listRecentByCompany(companyId: string, limit = 40) {
    return getSupabase()
      .from("appointments")
      .select("id,created_at,appointment_date,appointment_time,status,client:clients(name,whatsapp,email),service:services(name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  updateStatus(companyId: string, appointmentId: string, status: string) {
    return getSupabase()
      .from("appointments")
      .update({ status })
      .eq("company_id", companyId)
      .eq("id", appointmentId)
      .select("*, client:clients(name,email,whatsapp), service:services(name,duration_minutes,buffer_minutes), provider:service_providers(display_name,color,photo_url)")
      .single();
  },
};
