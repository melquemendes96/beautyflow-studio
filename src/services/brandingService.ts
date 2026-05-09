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

  upsert(companyId: string, patch: Record<string, any>) {
    return getSupabase()
      .from("branding_settings")
      .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" })
      .select("*")
      .single();
  },

  /** Página pública: resolve empresa pelo slug e retorna branding (duas leituras; pode virar RPC depois). */
  async getByPublicSlug(slug: string) {
    const supabase = getSupabase();
    const company = await supabase.from("companies").select("id").eq("slug", slug).maybeSingle();
    if (company.error) {
      return { data: null, error: company.error };
    }
    if (!company.data) {
      return { data: null, error: null };
    }
    return supabase
      .from("branding_settings")
      .select("*")
      .eq("company_id", company.data.id)
      .maybeSingle();
  },
};
