import { getSupabase } from "@/lib/supabaseClient";

export type PaymentMethodPreference = "pix" | "credit_card" | "debit_card" | "boleto" | "manual_transfer";

export const checkoutService = {
  startCheckout(params: {
    companyId: string;
    planId: string;
    paymentMethod: PaymentMethodPreference;
    trial: boolean;
    billingProfile: {
      legal_name: string;
      document: string;
      email: string;
      phone: string;
      address_line1: string;
      address_line2?: string;
      city: string;
      state: string;
      postal_code: string;
    };
  }) {
    return getSupabase().rpc("company_start_checkout", {
      p_company_id: params.companyId,
      p_plan_id: params.planId,
      p_payment_method: params.paymentMethod,
      p_trial: params.trial,
      p_legal_name: params.billingProfile.legal_name,
      p_document: params.billingProfile.document,
      p_email: params.billingProfile.email,
      p_phone: params.billingProfile.phone,
      p_address_line1: params.billingProfile.address_line1,
      p_address_line2: params.billingProfile.address_line2 ?? null,
      p_city: params.billingProfile.city,
      p_state: params.billingProfile.state,
      p_postal_code: params.billingProfile.postal_code,
    });
  },

  /** Preferência Checkout Pro (access token só na Edge Function). */
  createMercadoPagoCheckout(params: { paymentId: string }) {
    const origin =
      typeof globalThis !== "undefined" && "location" in globalThis && globalThis.location
        ? globalThis.location.origin
        : "";
    return getSupabase().functions.invoke<{ url?: string }>("create-mercado-pago-preference", {
      body: { payment_id: params.paymentId, origin },
    });
  },
};
