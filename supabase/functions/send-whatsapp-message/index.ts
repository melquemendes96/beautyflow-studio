/**
 * Envio WhatsApp Cloud API (templates) — confirmação pós-agendamento e lembrete 24h.
 * Auth: send_token (público), JWT admin da empresa, ou service role (cron).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const LOG = "[send-whatsapp-message]";
const GRAPH_API_VERSION = "v21.0";

type SendBody = {
  appointment_id?: string;
  log_id?: string;
  /** Token único retornado por create_public_booking (obrigatório para chamadas públicas). */
  send_token?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Dígitos E.164 sem + (ex.: 5511999999999). */
function normalizeWhatsAppTo(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

function formatDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Admin da empresa ou platform admin podem reenviar sem send_token. */
async function isCompanyWhatsAppAdmin(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
  companyId: string,
): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const jwt = authHeader.slice(7).trim();
  if (!jwt) return false;

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!anonKey) return false;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) return false;

  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (platformAdmin) return true;

  const { data: membership } = await admin
    .from("company_users")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  const role = String(membership?.role ?? "");
  return role === "owner" || role === "admin";
}

function isServiceRoleRequest(req: Request, serviceKey: string): boolean {
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(auth && serviceKey && auth === serviceKey);
}

function buildTemplateBody(
  messageType: string,
  params: { clientName: string; serviceName: string; dateStr: string; timeStr: string },
): { templateName: string; bodyParameters: { type: string; text: string }[] } {
  if (messageType === "booking_reminder") {
    return {
      templateName: "booking_reminder",
      bodyParameters: [
        { type: "text", text: params.clientName },
        { type: "text", text: params.serviceName },
        { type: "text", text: params.timeStr },
      ],
    };
  }
  return {
    templateName: "booking_confirmation",
    bodyParameters: [
      { type: "text", text: params.clientName },
      { type: "text", text: params.serviceName },
      { type: "text", text: params.dateStr },
      { type: "text", text: params.timeStr },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error(LOG, "misconfigured supabase env");
    return jsonResponse({ error: "misconfigured" }, 500);
  }

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const appointmentId = body.appointment_id?.trim();
  const logId = body.log_id?.trim();
  if (!appointmentId && !logId) {
    return jsonResponse({ error: "appointment_id_or_log_id_required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let logQuery = admin
    .from("whatsapp_message_logs")
    .select("id, company_id, appointment_id, client_id, phone, message_type, payload, status, created_at");

  if (logId) {
    logQuery = logQuery.eq("id", logId);
  } else {
    logQuery = logQuery
      .eq("appointment_id", appointmentId!)
      .in("message_type", ["booking_confirmation", "booking_reminder"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: logs, error: logErr } = await logQuery;
  if (logErr) {
    console.error(LOG, "log fetch error", logErr);
    return jsonResponse({ error: "log_fetch_failed", detail: logErr.message }, 500);
  }

  const log = Array.isArray(logs) ? logs[0] : logs;
  if (!log) {
    return jsonResponse({ error: "log_not_found" }, 404);
  }

  const companyId = String(log.company_id ?? "");
  const messageType = String(log.message_type ?? "booking_confirmation");
  const isService = isServiceRoleRequest(req, serviceKey);
  const isAdmin = isService || (await isCompanyWhatsAppAdmin(req, supabaseUrl, serviceKey, companyId));

  if (!isAdmin) {
    const sendToken = body.send_token?.trim() ?? "";
    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const expectedToken = typeof payload.send_token === "string" ? payload.send_token.trim() : "";

    if (!sendToken || !expectedToken || !tokensEqual(sendToken, expectedToken)) {
      console.warn(LOG, "unauthorized send attempt", {
        log_id: log.id,
        has_token: Boolean(sendToken),
      });
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (appointmentId && log.appointment_id && appointmentId !== String(log.appointment_id)) {
      return jsonResponse({ error: "appointment_mismatch" }, 400);
    }
  }

  if (log.status !== "pending") {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: "not_pending",
      status: log.status,
      log_id: log.id,
    });
  }

  const createdAt = new Date(log.created_at as string).getTime();
  const maxAgeMs = messageType === "booking_reminder" ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  if (Number.isFinite(createdAt) && Date.now() - createdAt > maxAgeMs) {
    console.warn(LOG, "log too old", { log_id: log.id, messageType });
    return jsonResponse({ error: "log_expired" }, 410);
  }

  const { data: conn, error: connErr } = await admin
    .from("whatsapp_connections")
    .select("phone_number_id, access_token_encrypted, status, business_id")
    .eq("company_id", log.company_id)
    .maybeSingle();

  if (connErr || !conn) {
    console.error(LOG, "connection error", connErr);
    await admin
      .from("whatsapp_message_logs")
      .update({ status: "failed", error_message: "connection_not_found" })
      .eq("id", log.id);
    return jsonResponse({ error: "connection_not_found" }, 422);
  }

  if (conn.status !== "active") {
    await admin
      .from("whatsapp_message_logs")
      .update({ status: "failed", error_message: `connection_${conn.status}` })
      .eq("id", log.id);
    return jsonResponse({ error: "connection_not_active", status: conn.status }, 422);
  }

  const token =
    conn.access_token_encrypted?.trim() || Deno.env.get("WHATSAPP_TOKEN")?.trim() || "";
  const phoneNumberId =
    conn.phone_number_id?.trim() || Deno.env.get("PHONE_NUMBER_ID")?.trim() || "";

  if (!token || !phoneNumberId) {
    await admin
      .from("whatsapp_message_logs")
      .update({ status: "failed", error_message: "missing_token_or_phone_number_id" })
      .eq("id", log.id);
    return jsonResponse({ error: "missing_credentials" }, 422);
  }

  const apptId = log.appointment_id as string;
  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .select("id, appointment_date, appointment_time, company_id, service_id, client_id")
    .eq("id", apptId)
    .maybeSingle();

  if (apptErr || !appt) {
    await admin
      .from("whatsapp_message_logs")
      .update({ status: "failed", error_message: "appointment_not_found" })
      .eq("id", log.id);
    return jsonResponse({ error: "appointment_not_found" }, 404);
  }

  const [{ data: client }, { data: service }, { data: company }] = await Promise.all([
    admin.from("clients").select("name").eq("id", appt.client_id).maybeSingle(),
    admin.from("services").select("name").eq("id", appt.service_id).maybeSingle(),
    admin.from("companies").select("name").eq("id", appt.company_id).maybeSingle(),
  ]);

  const payload = (log.payload ?? {}) as Record<string, unknown>;
  const language = String(payload.language ?? "pt_BR");

  const clientName = String(client?.name ?? "Cliente").trim() || "Cliente";
  const serviceName = String(service?.name ?? "Serviço").trim() || "Serviço";
  const companyName = String(company?.name ?? "Studio").trim() || "Studio";
  const dateStr = formatDateBr(String(appt.appointment_date));
  const timeStr = String(appt.appointment_time).slice(0, 5);

  const to = normalizeWhatsAppTo(String(log.phone));
  if (!to) {
    await admin
      .from("whatsapp_message_logs")
      .update({ status: "failed", error_message: "invalid_phone" })
      .eq("id", log.id);
    return jsonResponse({ error: "invalid_phone" }, 422);
  }

  const tpl = buildTemplateBody(messageType, { clientName, serviceName, dateStr, timeStr });
  const templateName = String(payload.template_name ?? tpl.templateName);

  const graphBody = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: tpl.bodyParameters,
        },
      ],
    },
  };

  console.log(LOG, "sending template", {
    log_id: log.id,
    appointment_id: apptId,
    templateName,
    to_suffix: to.slice(-4),
    phone_number_id: phoneNumberId,
  });

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const graphRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(graphBody),
  });

  const graphJson = await graphRes.json().catch(() => ({}));

  if (!graphRes.ok) {
    const errMsg =
      (graphJson as { error?: { message?: string; code?: number } })?.error?.message ??
      `graph_http_${graphRes.status}`;
    console.error(LOG, "graph error", graphJson);
    await admin
      .from("whatsapp_message_logs")
      .update({
        status: "failed",
        error_message: errMsg.slice(0, 500),
        payload: { ...payload, graph_request: graphBody, graph_response: graphJson },
      })
      .eq("id", log.id);
    return jsonResponse({ ok: false, error: "graph_send_failed", detail: errMsg }, 502);
  }

  const metaMessageId =
    (graphJson as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null;

  await admin
    .from("whatsapp_message_logs")
    .update({
      status: "sent",
      meta_message_id: metaMessageId,
      error_message: null,
      payload: { ...payload, graph_request: graphBody, graph_response: graphJson },
    })
    .eq("id", log.id);

  console.log(LOG, "sent ok", { log_id: log.id, meta_message_id: metaMessageId });

  return jsonResponse({
    ok: true,
    log_id: log.id,
    meta_message_id: metaMessageId,
    company_name: companyName,
  });
});
