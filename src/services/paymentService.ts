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
};
