import { getSupabase } from "@/lib/supabaseClient";

/**
 * Personalização visual (`branding_settings` por `company_id`).
 */
export const brandingService = {
  getByCompany(companyId: string) {
    return getSupabase()
      .from("branding_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
  },

  upsert(companyId: string, patch: Record<string, unknown>) {
    return getSupabase()
      .from("branding_settings")
      .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" })
      .select("*")
      .single();
  },
};
