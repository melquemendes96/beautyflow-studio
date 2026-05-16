import { getSupabase } from "@/lib/supabaseClient";

export type CompanyOnboardingInput = {
  companyName: string;
  ownerName?: string;
  whatsapp?: string;
  segment?: string;
  document?: string;
  city?: string;
  state?: string;
};

export const onboardingService = {
  bootstrapCompany(params?: { companyName?: string | null }) {
    return getSupabase().rpc("user_bootstrap_company", {
      p_company_name: params?.companyName ?? null,
    });
  },

  completeCompanyOnboarding(input: CompanyOnboardingInput) {
    return getSupabase().rpc("complete_company_onboarding", {
      p_company_name: input.companyName,
      p_owner_name: input.ownerName ?? null,
      p_whatsapp: input.whatsapp ?? null,
      p_segment: input.segment ?? null,
      p_document: input.document ?? null,
      p_city: input.city ?? null,
      p_state: input.state ?? null,
    });
  },

  markOnboardingComplete() {
    return getSupabase().rpc("company_mark_onboarding_complete");
  },
};

