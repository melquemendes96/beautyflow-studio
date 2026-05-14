import { getSupabase } from "@/lib/supabaseClient";

export const supportTicketService = {
  createByCompany(params: {
    companyId: string;
    subject: string;
    message: string;
    priority?: "low" | "normal" | "high";
  }) {
    return getSupabase()
      .from("support_tickets")
      .insert({
        company_id: params.companyId,
        subject: params.subject,
        message: params.message,
        priority: params.priority ?? "normal",
        status: "open",
      })
      .select("*")
      .single();
  },

  /** Chamados da empresa (painel admin — notificações). */
  listRecentForCompany(companyId: string, limit = 40) {
    return getSupabase()
      .from("support_tickets")
      .select("id, subject, status, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
  },
};

