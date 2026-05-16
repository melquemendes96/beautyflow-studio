import { getSupabase } from "@/lib/supabaseClient";

/**
 * Empresas (multiempresa). Depende das migrations da Fase 2 (`companies`, RLS na Fase 3).
 */
export const companyService = {
  getBySlug(slug: string) {
    return getSupabase().from("companies").select("*").eq("slug", slug).maybeSingle();
  },

  getByIdForAdmin(companyId: string) {
    return getSupabase()
      .from("companies")
      .select("id,name,slug,status,plan_id,onboarding_completed,email,phone,slug_change_count")
      .eq("id", companyId)
      .maybeSingle();
  },

  /** Owner/admin da empresa (RLS `companies_update`). */
  updateForAdmin(companyId: string, patch: Record<string, unknown>) {
    return getSupabase().from("companies").update(patch).eq("id", companyId).select("id,name,slug").maybeSingle();
  },
};
