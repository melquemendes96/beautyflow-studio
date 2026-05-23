import { sanitizePlanList } from "@/lib/plan-feature-labels";
import { getSupabase } from "@/lib/supabaseClient";

/**
 * Planos e assinaturas (`plans`, `tenant_subscriptions`, `payment_transactions`).
 */
export const subscriptionService = {
  async listPlans() {
    const supabase = getSupabase();
    const rpc = await supabase.rpc("list_public_plans");
    if (!rpc.error && rpc.data) {
      return { ...rpc, data: sanitizePlanList(rpc.data as { features?: string[] | null }[]) };
    }
    const table = await supabase
      .from("plans")
      .select("id, name, price, features, active")
      .eq("active", true)
      .order("price");
    if (!table.error && table.data) {
      return { ...table, data: sanitizePlanList(table.data) };
    }
    return table;
  },

  getSubscriptionByCompany(companyId: string) {
    return getSupabase()
      .from("tenant_subscriptions")
      .select("*, plans(*)")
      .eq("company_id", companyId)
      .maybeSingle();
  },

  listPaymentsByCompany(companyId: string) {
    return getSupabase()
      .from("payment_transactions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
  },
};
