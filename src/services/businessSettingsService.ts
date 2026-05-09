import { getSupabase } from "@/lib/supabaseClient";

/**
 * Regras e funcionamento (`business_settings` por `company_id`).
 */
export const businessSettingsService = {
  getByCompany(companyId: string) {
    return getSupabase()
      .from("business_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
  },

  upsert(companyId: string, patch: Record<string, any>) {
    return getSupabase()
      .from("business_settings")
      .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" })
      .select("*")
      .single();
  },
};

