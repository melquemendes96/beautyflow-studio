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
};

