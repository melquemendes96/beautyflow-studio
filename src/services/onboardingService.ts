import { getSupabase } from "@/lib/supabaseClient";

export const onboardingService = {
  bootstrapCompany(params?: { companyName?: string | null }) {
    return getSupabase().rpc("user_bootstrap_company", {
      p_company_name: params?.companyName ?? null,
    });
  },

  markOnboardingComplete() {
    return getSupabase().rpc("company_mark_onboarding_complete");
  },
};

