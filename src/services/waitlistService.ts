import { getSupabase } from "@/lib/supabaseClient";

/**
 * Lista de espera (`waitlist` + `company_id`).
 */
export const waitlistService = {
  listByCompany(companyId: string) {
    return getSupabase()
      .from("waitlist")
      .select("*, client:clients(name,email,whatsapp), service:services(name)")
      .eq("company_id", companyId)
      .order("desired_date", { ascending: true })
      .order("created_at", { ascending: true });
  },

  create(
    companyId: string,
    input: { client_id: string; service_id: string; desired_date?: string | null; notes?: string | null },
  ) {
    return getSupabase()
      .from("waitlist")
      .insert({
        company_id: companyId,
        client_id: input.client_id,
        service_id: input.service_id,
        desired_date: input.desired_date ?? null,
        notes: input.notes ?? null,
      })
      .select("*, client:clients(name,email,whatsapp), service:services(name)")
      .single();
  },

  remove(companyId: string, waitlistId: string) {
    return getSupabase().from("waitlist").delete().eq("company_id", companyId).eq("id", waitlistId);
  },
};

