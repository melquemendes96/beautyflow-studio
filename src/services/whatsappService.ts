import { getSupabase, getSupabaseProjectRef, isSupabaseConfigured } from "@/lib/supabaseClient";

export type WhatsappConnectionStatus = "not_configured" | "pending" | "active" | "error";

export type WhatsappConnectionSafe = {
  id: string;
  company_id: string;
  provider: string;
  business_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  webhook_verify_token: string | null;
  status: WhatsappConnectionStatus;
  has_access_token: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WhatsappTemplateRow = {
  id: string;
  type: string;
  template_name: string;
  language: string;
  body_preview: string | null;
  status: string;
  created_at?: string;
};

export type WhatsappMessageStats = {
  sent: number;
  failed: number;
  inbound: number;
  pending: number;
};

export type WhatsappMessageLogRow = {
  id: string;
  message_type: string;
  status: string;
  phone: string;
  error_message: string | null;
  meta_message_id: string | null;
  created_at: string;
  appointment_date: string | null;
  appointment_time: string | null;
  client_name: string | null;
  service_name: string | null;
};

export type WhatsappSetupStatus = {
  plan_has_whatsapp: boolean;
  connection: {
    status: string;
    has_business_id: boolean;
    has_phone_number_id: boolean;
    has_verify_token: boolean;
    has_access_token: boolean;
    display_phone_number: string | null;
  } | null;
  template_confirmation_status: string;
  template_reminder_status: string;
  ready_to_send: boolean;
};

function parseRpcJson<T extends { ok?: boolean }>(data: unknown): T | null {
  if (!data || typeof data !== "object") return null;
  return data as T;
}

export function buildMetaWebhookUrl(companyId: string): string | null {
  const ref = getSupabaseProjectRef();
  if (!ref || !companyId) return null;
  return `https://${ref}.supabase.co/functions/v1/meta-whatsapp-webhook?company_id=${encodeURIComponent(companyId)}`;
}

export const whatsappService = {
  async getConnection(companyId: string) {
    const res = await getSupabase().rpc("get_whatsapp_connection", { p_company_id: companyId });
    if (res.error) return { data: null, error: res.error };
    const parsed = parseRpcJson<{ ok: boolean; connection: WhatsappConnectionSafe | null }>(res.data);
    return { data: parsed?.connection ?? null, error: null };
  },

  async saveConnection(params: {
    companyId: string;
    businessId: string;
    phoneNumberId: string;
    displayPhoneNumber?: string;
    webhookVerifyToken?: string;
    accessToken?: string;
    status?: WhatsappConnectionStatus;
  }) {
    const res = await getSupabase().rpc("save_whatsapp_connection", {
      p_company_id: params.companyId,
      p_business_id: params.businessId,
      p_phone_number_id: params.phoneNumberId,
      p_display_phone_number: params.displayPhoneNumber ?? null,
      p_webhook_verify_token: params.webhookVerifyToken ?? null,
      p_access_token: params.accessToken?.trim() ? params.accessToken.trim() : null,
      p_status: params.status ?? "pending",
    });
    if (res.error) return { data: null, error: res.error };
    const parsed = parseRpcJson<{ ok: boolean; connection?: WhatsappConnectionSafe; error?: string }>(res.data);
    if (parsed && parsed.ok === false) {
      return { data: null, error: new Error(parsed.error ?? "save_failed") };
    }
    return { data: parsed?.connection ?? null, error: null };
  },

  async getStats(companyId: string) {
    const res = await getSupabase().rpc("get_whatsapp_message_stats", { p_company_id: companyId });
    if (res.error) return { data: null, error: res.error };
    const parsed = parseRpcJson<{ ok: boolean } & WhatsappMessageStats>(res.data);
    return {
      data: parsed
        ? { sent: parsed.sent, failed: parsed.failed, inbound: parsed.inbound, pending: parsed.pending }
        : null,
      error: null,
    };
  },

  async listTemplates(companyId: string) {
    const res = await getSupabase().rpc("list_whatsapp_templates", { p_company_id: companyId });
    if (res.error) return { data: [] as WhatsappTemplateRow[], error: res.error };
    const parsed = parseRpcJson<{ ok: boolean; templates: WhatsappTemplateRow[] }>(res.data);
    return { data: parsed?.templates ?? [], error: null };
  },

  async seedTemplates(companyId: string) {
    return getSupabase().rpc("seed_whatsapp_templates_defaults", { p_company_id: companyId });
  },

  async upsertTemplate(params: {
    companyId: string;
    type: string;
    templateName: string;
    language?: string;
    bodyPreview?: string;
    status?: "draft" | "pending" | "approved" | "rejected";
  }) {
    return getSupabase().rpc("upsert_whatsapp_template", {
      p_company_id: params.companyId,
      p_type: params.type,
      p_template_name: params.templateName,
      p_language: params.language ?? "pt_BR",
      p_body_preview: params.bodyPreview ?? null,
      p_status: params.status ?? "draft",
    });
  },

  async listMessageLogs(companyId: string, limit = 50) {
    const res = await getSupabase().rpc("list_whatsapp_message_logs", {
      p_company_id: companyId,
      p_limit: limit,
    });
    if (res.error) return { data: [] as WhatsappMessageLogRow[], error: res.error };
    const parsed = parseRpcJson<{ ok: boolean; logs: WhatsappMessageLogRow[] }>(res.data);
    return { data: parsed?.logs ?? [], error: null };
  },

  async getSetupStatus(companyId: string) {
    const res = await getSupabase().rpc("get_whatsapp_setup_status", { p_company_id: companyId });
    if (res.error) return { data: null, error: res.error };
    const parsed = parseRpcJson<{ ok: boolean } & WhatsappSetupStatus>(res.data);
    if (!parsed?.ok) return { data: null, error: new Error("setup_status_failed") };
    return {
      data: {
        plan_has_whatsapp: parsed.plan_has_whatsapp,
        connection: parsed.connection,
        template_confirmation_status: parsed.template_confirmation_status,
        template_reminder_status: parsed.template_reminder_status,
        ready_to_send: parsed.ready_to_send,
      },
      error: null,
    };
  },

  async verifyConnection(companyId: string) {
    const { data, error } = await getSupabase().functions.invoke("verify-whatsapp-connection", {
      body: { company_id: companyId },
    });
    if (error) return { data: null, error };
    return { data: data as Record<string, unknown>, error: null };
  },

  isConfigured(): boolean {
    return isSupabaseConfigured();
  },
};
