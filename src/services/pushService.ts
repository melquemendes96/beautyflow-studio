import { getSupabase } from "@/lib/supabaseClient";

export const pushService = {
  async upsertSubscription(input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    companyId?: string | null;
    profile?: "admin" | "staff" | "master";
    userAgent?: string;
  }) {
    return getSupabase().rpc("upsert_push_subscription", {
      p_endpoint: input.endpoint,
      p_p256dh: input.p256dh,
      p_auth: input.auth,
      p_company_id: input.companyId ?? null,
      p_profile: input.profile ?? "admin",
      p_user_agent: input.userAgent ?? null,
    });
  },

  async deleteSubscription(endpoint: string) {
    return getSupabase().rpc("delete_push_subscription", { p_endpoint: endpoint });
  },

  async requestOutboxDelivery(limit = 30) {
    return getSupabase().rpc("request_push_outbox_delivery", { p_limit: limit });
  },
};
