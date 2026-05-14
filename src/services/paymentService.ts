import { getSupabase } from "@/lib/supabaseClient";

export type SimulatedPaymentOutcome = "approved" | "pending" | "failed";

/**
 * Pagamentos (`payment_transactions`). Simulação local até integração definitiva com gateway (webhook).
 */
export const paymentService = {
  simulateCompanyPaymentOutcome(paymentId: string, outcome: SimulatedPaymentOutcome) {
    return getSupabase().rpc("company_simulate_payment_outcome", {
      p_payment_id: paymentId,
      p_outcome: outcome,
    });
  },

  /** Pagamentos confirmados da empresa (painel admin — notificações). */
  listRecentPaidForCompany(companyId: string, limit = 40) {
    return getSupabase()
      .from("payment_transactions")
      .select("id, amount, paid_at, created_at, status")
      .eq("company_id", companyId)
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(limit);
  },
};
