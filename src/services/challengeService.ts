import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getStoredMarketingUtm } from "@/lib/marketing-analytics";

export type ChallengeLeadInput = {
  fullName: string;
  whatsapp: string;
  email: string;
  instagram: string;
  businessName: string;
};

export const challengeService = {
  async submitLead(input: ChallengeLeadInput) {
    if (!isSupabaseConfigured()) {
      return { data: null as { ok?: boolean; lead_id?: string; error?: string } | null, error: new Error("Supabase não configurado") };
    }
    const utm = getStoredMarketingUtm();
    const { data, error } = await getSupabase().rpc("submit_challenge_lead", {
      p_full_name: input.fullName,
      p_whatsapp: input.whatsapp,
      p_email: input.email,
      p_instagram: input.instagram,
      p_business_name: input.businessName,
      p_utm_source: utm.source ?? null,
      p_utm_medium: utm.medium ?? null,
      p_utm_campaign: utm.campaign ?? null,
      p_utm_content: utm.content ?? null,
      p_utm_term: utm.term ?? null,
    });
    return { data: data as { ok?: boolean; lead_id?: string; error?: string; existing?: boolean } | null, error };
  },

  async linkLead(leadId: string, companyId?: string | null) {
    if (!isSupabaseConfigured() || !leadId) {
      return { data: null, error: null };
    }
    const { data, error } = await getSupabase().rpc("link_challenge_lead", {
      p_lead_id: leadId,
      p_company_id: companyId ?? null,
    });
    return { data, error };
  },
};
