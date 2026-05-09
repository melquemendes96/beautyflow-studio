import { getSupabase } from "@/lib/supabaseClient";

/**
 * Clientes finais por empresa (`clients` + `company_id`).
 */
export const clientService = {
  listByCompany(companyId: string) {
    return getSupabase()
      .from("clients")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
  },

  create(companyId: string, input: { name: string; email?: string; whatsapp?: string; notes?: string | null }) {
    return getSupabase()
      .from("clients")
      .insert({
        company_id: companyId,
        name: input.name,
        email: input.email ?? null,
        whatsapp: input.whatsapp ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
  },

  update(
    companyId: string,
    clientId: string,
    patch: { name?: string; email?: string | null; whatsapp?: string | null; notes?: string | null },
  ) {
    return getSupabase()
      .from("clients")
      .update(patch)
      .eq("company_id", companyId)
      .eq("id", clientId)
      .select("*")
      .single();
  },

  getById(companyId: string, clientId: string) {
    return getSupabase()
      .from("clients")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", clientId)
      .maybeSingle();
  },
};
