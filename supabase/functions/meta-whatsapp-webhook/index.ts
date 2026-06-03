/**
 * Meta WhatsApp Cloud API — webhook (GET verificação + POST eventos).
 *
 * Multi-tenant:
 * - Cadastre no Meta: .../meta-whatsapp-webhook?company_id=<uuid>
 * - Ou resolva empresa pelo phone_number_id / WABA (business_id) no payload POST.
 *
 * Secrets (Edge Functions):
 * - META_APP_SECRET (valida X-Hub-Signature-256 em POST)
 * - VERIFY_TOKEN (fallback GET se banco vazio ou URL sem company_id)
 * - WHATSAPP_TOKEN, PHONE_NUMBER_ID, WABA_ID (fallback resolução de empresa; envio outbound é outra function)
 *
 * Este endpoint RECEBE eventos da Meta. Não envia mensagens ao WhatsApp.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const LOG = "[meta-whatsapp-webhook]";

type WhatsappConnectionRow = {
  id: string;
  company_id: string;
  business_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  webhook_verify_token: string | null;
  status: string;
};

type EnvSnapshot = {
  hasMetaAppSecret: boolean;
  hasVerifyToken: boolean;
  hasWhatsappToken: boolean;
  hasPhoneNumberId: boolean;
  hasWabaId: boolean;
  phoneNumberIdEnv: string | null;
  wabaIdEnv: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function plainResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const na = a.trim();
  const nb = b.trim();
  if (na.length !== nb.length) return false;
  let x = 0;
  for (let i = 0; i < na.length; i++) x |= na.charCodeAt(i) ^ nb.charCodeAt(i);
  return x === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
}

function readEnvSnapshot(): EnvSnapshot {
  const phoneNumberIdEnv = Deno.env.get("PHONE_NUMBER_ID")?.trim() || null;
  const wabaIdEnv = Deno.env.get("WABA_ID")?.trim() || null;
  const whatsappToken = Deno.env.get("WHATSAPP_TOKEN")?.trim() || null;

  return {
    hasMetaAppSecret: Boolean(Deno.env.get("META_APP_SECRET")?.trim()),
    hasVerifyToken: Boolean(Deno.env.get("VERIFY_TOKEN")?.trim()),
    hasWhatsappToken: Boolean(whatsappToken),
    hasPhoneNumberId: Boolean(phoneNumberIdEnv),
    hasWabaId: Boolean(wabaIdEnv),
    phoneNumberIdEnv,
    wabaIdEnv,
  };
}

function logEnvSnapshot(env: EnvSnapshot): void {
  console.log(LOG, "env", {
    META_APP_SECRET: env.hasMetaAppSecret,
    VERIFY_TOKEN: env.hasVerifyToken,
    WHATSAPP_TOKEN: env.hasWhatsappToken
      ? `set(len=${Deno.env.get("WHATSAPP_TOKEN")?.length ?? 0})`
      : "missing",
    PHONE_NUMBER_ID: env.phoneNumberIdEnv ?? "missing",
    WABA_ID: env.wabaIdEnv ?? "missing",
  });
}

async function assertMetaSignature(
  req: Request,
  rawBody: string,
  appSecret: string,
): Promise<Response | null> {
  const sigHeader =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");

  if (!sigHeader?.startsWith("sha256=")) {
    console.error(LOG, "signature missing X-Hub-Signature-256");
    return jsonResponse({ error: "missing_signature" }, 401);
  }

  const expectedHex = sigHeader.slice("sha256=".length).trim();
  const actualHex = await hmacSha256Hex(appSecret, rawBody);

  if (!timingSafeEqual(expectedHex.toLowerCase(), actualHex.toLowerCase())) {
    console.error(LOG, "signature mismatch", {
      headerPrefix: expectedHex.slice(0, 12),
      computedPrefix: actualHex.slice(0, 12),
      bodyLength: rawBody.length,
    });
    return jsonResponse({ error: "invalid_signature" }, 403);
  }

  console.log(LOG, "signature ok", { bodyLength: rawBody.length });
  return null;
}

async function loadConnectionByCompanyId(
  admin: SupabaseClient,
  companyId: string,
): Promise<WhatsappConnectionRow | null> {
  const { data, error } = await admin
    .from("whatsapp_connections")
    .select("id, company_id, business_id, phone_number_id, display_phone_number, webhook_verify_token, status")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error(LOG, "loadConnectionByCompanyId error", { companyId, message: error.message });
    return null;
  }
  return (data as WhatsappConnectionRow | null) ?? null;
}

async function loadConnectionByPhoneNumberId(
  admin: SupabaseClient,
  phoneNumberId: string,
): Promise<WhatsappConnectionRow | null> {
  const { data, error } = await admin
    .from("whatsapp_connections")
    .select("id, company_id, business_id, phone_number_id, display_phone_number, webhook_verify_token, status")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error(LOG, "loadConnectionByPhoneNumberId error", { phoneNumberId, message: error.message });
    return null;
  }
  return (data as WhatsappConnectionRow | null) ?? null;
}

async function loadConnectionByBusinessId(
  admin: SupabaseClient,
  businessId: string,
): Promise<WhatsappConnectionRow | null> {
  const { data, error } = await admin
    .from("whatsapp_connections")
    .select("id, company_id, business_id, phone_number_id, display_phone_number, webhook_verify_token, status")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    console.error(LOG, "loadConnectionByBusinessId error", { businessId, message: error.message });
    return null;
  }
  return (data as WhatsappConnectionRow | null) ?? null;
}

async function resolveExpectedVerifyToken(
  admin: SupabaseClient,
  companyId: string | null,
  envVerifyToken: string | null,
): Promise<{ token: string | null; source: string }> {
  if (companyId) {
    const row = await loadConnectionByCompanyId(admin, companyId);
    const dbToken = row?.webhook_verify_token?.trim() ?? "";
    if (dbToken) return { token: dbToken, source: "whatsapp_connections" };
    if (envVerifyToken) {
      console.warn(LOG, "verify token fallback to VERIFY_TOKEN env (no row or empty webhook_verify_token)", {
        companyId,
      });
      return { token: envVerifyToken, source: "VERIFY_TOKEN env" };
    }
    console.error(LOG, "no verify token in DB or env", { companyId });
    return { token: null, source: "none" };
  }

  if (envVerifyToken) {
    return { token: envVerifyToken, source: "VERIFY_TOKEN env" };
  }

  const { data, error } = await admin
    .from("whatsapp_connections")
    .select("webhook_verify_token")
    .not("webhook_verify_token", "is", null)
    .limit(2);

  if (error) {
    console.error(LOG, "resolveExpectedVerifyToken list error", error.message);
    return { token: null, source: "none" };
  }

  const rows = (data ?? []) as { webhook_verify_token: string | null }[];
  if (rows.length === 1 && rows[0]?.webhook_verify_token?.trim()) {
    return { token: rows[0].webhook_verify_token.trim(), source: "single whatsapp_connections row" };
  }

  if (rows.length > 1) {
    console.error(LOG, "multiple connections without company_id — use ?company_id= on webhook URL");
  }

  return { token: null, source: "none" };
}

async function resolveCompanyFromPayload(
  admin: SupabaseClient,
  payload: unknown,
  env: EnvSnapshot,
  queryCompanyId: string | null,
): Promise<{ companyId: string | null; connection: WhatsappConnectionRow | null; hint: string }> {
  if (queryCompanyId) {
    const row = await loadConnectionByCompanyId(admin, queryCompanyId);
    if (row) return { companyId: row.company_id, connection: row, hint: "query company_id" };
    console.error(LOG, "company_id in query but no whatsapp_connections row", { queryCompanyId });
  }

  const entries = extractEntries(payload);
  for (const entry of entries) {
    const wabaId = typeof entry.id === "string" ? entry.id : String(entry.id ?? "");
    if (wabaId) {
      const byWaba = await loadConnectionByBusinessId(admin, wabaId);
      if (byWaba) return { companyId: byWaba.company_id, connection: byWaba, hint: `entry.id WABA ${wabaId}` };
    }

    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (phoneNumberId) {
        const byPhone = await loadConnectionByPhoneNumberId(admin, String(phoneNumberId));
        if (byPhone) {
          return { companyId: byPhone.company_id, connection: byPhone, hint: `metadata.phone_number_id ${phoneNumberId}` };
        }
      }
    }
  }

  if (env.phoneNumberIdEnv) {
    const byEnvPhone = await loadConnectionByPhoneNumberId(admin, env.phoneNumberIdEnv);
    if (byEnvPhone) {
      return { companyId: byEnvPhone.company_id, connection: byEnvPhone, hint: "PHONE_NUMBER_ID env" };
    }
  }

  if (env.wabaIdEnv) {
    const byEnvWaba = await loadConnectionByBusinessId(admin, env.wabaIdEnv);
    if (byEnvWaba) {
      return { companyId: byEnvWaba.company_id, connection: byEnvWaba, hint: "WABA_ID env" };
    }
  }

  return { companyId: null, connection: null, hint: "unresolved" };
}

type MetaChangeValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: unknown[];
  messages?: Record<string, unknown>[];
  statuses?: Record<string, unknown>[];
  errors?: unknown[];
};

type MetaChange = {
  field?: string;
  value?: MetaChangeValue;
};

type MetaEntry = {
  id?: string;
  changes?: MetaChange[];
};

function extractEntries(payload: unknown): MetaEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  if (!Array.isArray(obj.entry)) return [];
  return obj.entry as MetaEntry[];
}

async function updateOutboundLogByMetaId(
  admin: SupabaseClient,
  companyId: string,
  metaMessageId: string,
  stStatus: string,
  st: Record<string, unknown>,
  recipient: string,
): Promise<boolean> {
  if (!metaMessageId) return false;

  const errors = Array.isArray(st.errors) ? st.errors : [];
  const errorMessage =
    errors.length > 0
      ? String((errors[0] as Record<string, unknown>)?.message ?? (errors[0] as Record<string, unknown>)?.title ?? "delivery_failed")
      : null;

  const { data, error } = await admin
    .from("whatsapp_message_logs")
    .update({
      status: stStatus,
      error_message: errorMessage,
      payload: {
        direction: "status",
        status: st,
        recipient_id: recipient,
      },
    })
    .eq("company_id", companyId)
    .eq("meta_message_id", metaMessageId)
    .select("id");

  if (error) {
    console.error(LOG, "update outbound log failed", { metaMessageId, message: error.message });
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function insertMessageLog(
  admin: SupabaseClient,
  row: {
    company_id: string;
    phone: string;
    message_type: string;
    payload: Record<string, unknown>;
    status: string;
    meta_message_id?: string | null;
    error_message?: string | null;
    appointment_id?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("whatsapp_message_logs").insert({
    company_id: row.company_id,
    phone: row.phone,
    message_type: row.message_type,
    payload: row.payload,
    status: row.status,
    meta_message_id: row.meta_message_id ?? null,
    error_message: row.error_message ?? null,
    appointment_id: row.appointment_id ?? null,
  });

  if (error) {
    console.error(LOG, "whatsapp_message_logs insert failed", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      company_id: row.company_id,
      message_type: row.message_type,
    });
  }
}

async function processWebhookPayload(
  admin: SupabaseClient,
  payload: unknown,
  companyId: string,
): Promise<{ messages: number; statuses: number; errors: number }> {
  let messages = 0;
  let statuses = 0;
  let errors = 0;

  const entries = extractEntries(payload);
  console.log(LOG, "processing entries", { companyId, entryCount: entries.length });

  for (const entry of entries) {
    const wabaId = entry.id ?? null;
    for (const change of entry.changes ?? []) {
      const field = change.field ?? "unknown";
      const value = change.value;
      if (!value) {
        console.warn(LOG, "change without value", { field, wabaId });
        continue;
      }

      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      const displayPhone = value.metadata?.display_phone_number ?? null;

      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          messages += 1;
          const from = String(msg.from ?? "");
          const msgId = String(msg.id ?? "");
          const msgType = String(msg.type ?? "unknown");
          console.log(LOG, "Message event", {
            companyId,
            wabaId,
            phoneNumberId,
            displayPhone,
            field,
            from,
            msgId,
            msgType,
          });
          await insertMessageLog(admin, {
            company_id: companyId,
            phone: from || "unknown",
            message_type: "inbound",
            meta_message_id: msgId || null,
            status: "received",
            payload: {
              direction: "inbound",
              field,
              waba_id: wabaId,
              phone_number_id: phoneNumberId,
              message: msg,
            },
          });
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          statuses += 1;
          const recipient = String(st.recipient_id ?? "");
          const stId = String(st.id ?? "");
          const stStatus = String(st.status ?? "");
          console.log(LOG, "Status event", {
            companyId,
            wabaId,
            phoneNumberId,
            recipient,
            stId,
            stStatus,
          });

          const updated = await updateOutboundLogByMetaId(
            admin,
            companyId,
            stId,
            stStatus || "unknown",
            st,
            recipient,
          );

          if (!updated) {
            await insertMessageLog(admin, {
              company_id: companyId,
              phone: recipient || "unknown",
              message_type: "status",
              meta_message_id: stId || null,
              status: stStatus || "unknown",
              payload: {
                direction: "status",
                field,
                waba_id: wabaId,
                phone_number_id: phoneNumberId,
                status: st,
              },
            });
          }
        }
      }

      if (Array.isArray(value.errors) && value.errors.length > 0) {
        for (const err of value.errors) {
          errors += 1;
          console.error(LOG, "Meta payload error object", JSON.stringify(err));
        }
      }

      if (!value.messages?.length && !value.statuses?.length) {
        console.log(LOG, "change without messages/statuses", {
          field,
          messaging_product: value.messaging_product,
          phoneNumberId,
        });
      }
    }
  }

  return { messages, statuses, errors };
}

// ---------------------------------------------------------------------------
// GET — verificação hub.challenge
// ---------------------------------------------------------------------------

async function handleGet(
  req: Request,
  url: URL,
  admin: SupabaseClient,
  env: EnvSnapshot,
): Promise<Response> {
  if (req.method === "HEAD") {
    console.log(LOG, "HEAD ok");
    return new Response(null, { status: 200 });
  }

  const mode = url.searchParams.get("hub.mode");
  const verifyTokenParam = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const companyId = url.searchParams.get("company_id");

  console.log(LOG, "GET verification params", {
    mode,
    hasVerifyToken: Boolean(verifyTokenParam),
    hasChallenge: Boolean(challenge),
    companyId,
  });

  if (mode !== "subscribe") {
    console.log(LOG, "GET health (not hub subscribe)", { mode });
    return jsonResponse({
      ok: true,
      hint: "meta_whatsapp_webhook",
      usage: "GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...&company_id=<uuid>",
    });
  }

  if (!verifyTokenParam || challenge === null || challenge === undefined) {
    console.error(LOG, "GET subscribe missing verify_token or challenge");
    return jsonResponse({ error: "missing_verify_params" }, 400);
  }

  const envVerify = Deno.env.get("VERIFY_TOKEN")?.trim() || null;
  const { token: expectedToken, source } = await resolveExpectedVerifyToken(admin, companyId, envVerify);

  console.log(LOG, "GET verify token source", { source, hasExpected: Boolean(expectedToken) });

  if (!expectedToken) {
    console.error(LOG, "GET no expected verify token configured");
    return plainResponse("Forbidden — configure webhook_verify_token or VERIFY_TOKEN", 403);
  }

  if (!timingSafeEqual(verifyTokenParam, expectedToken)) {
    console.error(LOG, "GET verify token mismatch", {
      companyId,
      source,
      paramPrefix: verifyTokenParam.slice(0, 8),
      expectedPrefix: expectedToken.slice(0, 8),
    });
    return plainResponse("Forbidden", 403);
  }

  console.log(LOG, "GET verification success — returning challenge", {
    companyId,
    source,
    challengeLength: String(challenge).length,
  });

  return plainResponse(String(challenge), 200);
}

// ---------------------------------------------------------------------------
// POST — eventos Meta
// ---------------------------------------------------------------------------

async function handlePost(
  req: Request,
  url: URL,
  admin: SupabaseClient,
  env: EnvSnapshot,
): Promise<Response> {
  console.log("Webhook received");
  console.log(LOG, "POST start", {
    company_id_query: url.searchParams.get("company_id"),
    contentType: req.headers.get("content-type"),
    userAgent: req.headers.get("user-agent"),
  });

  const rawBody = await req.text();
  console.log(LOG, "POST raw body", { length: rawBody.length, empty: rawBody.length === 0 });

  const appSecret = Deno.env.get("META_APP_SECRET")?.trim() ?? "";

  if (!appSecret) {
    console.error(LOG, "META_APP_SECRET missing — rejecting POST in production mode");
    return jsonResponse({ error: "misconfigured", detail: "META_APP_SECRET required" }, 500);
  }

  const sigErr = await assertMetaSignature(req, rawBody, appSecret);
  if (sigErr) return sigErr;

  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error(LOG, "JSON parse error", parseErr);
      return jsonResponse({ error: "invalid_json", detail: String(parseErr) }, 400);
    }
  }

  console.log(JSON.stringify(payload, null, 2));

  const objectType =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).object : null;

  if (objectType !== "whatsapp_business_account") {
    console.warn(LOG, "unexpected object type (still processing)", { objectType });
  }

  const queryCompanyId = url.searchParams.get("company_id");
  const resolved = await resolveCompanyFromPayload(admin, payload, env, queryCompanyId);

  console.log(LOG, "company resolution", {
    companyId: resolved.companyId,
    hint: resolved.hint,
    connectionStatus: resolved.connection?.status ?? null,
    phone_number_id: resolved.connection?.phone_number_id ?? null,
    business_id: resolved.connection?.business_id ?? null,
  });

  if (!resolved.companyId) {
    console.error(LOG, "could not resolve company_id — check whatsapp_connections and webhook URL", {
      queryCompanyId,
      envPhone: env.phoneNumberIdEnv,
      envWaba: env.wabaIdEnv,
    });
    return jsonResponse(
      {
        received: true,
        processed: false,
        error: "company_unresolved",
        hint: "Add ?company_id=<uuid> to webhook URL or match phone_number_id/WABA in whatsapp_connections",
      },
      200,
    );
  }

  const counts = await processWebhookPayload(admin, payload, resolved.companyId);

  console.log(LOG, "POST done", {
    companyId: resolved.companyId,
    ...counts,
    note: "This webhook only RECEIVES events. Outbound WhatsApp requires Graph API send (WHATSAPP_TOKEN).",
  });

  return jsonResponse({
    received: true,
    processed: true,
    company_id: resolved.companyId,
    resolution: resolved.hint,
    counts,
  });
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const env = readEnvSnapshot();

  console.log(LOG, "request", {
    method: req.method,
    pathname: url.pathname,
    search: url.search,
  });
  logEnvSnapshot(env);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error(LOG, "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse({ error: "misconfigured", detail: "supabase env missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, x-hub-signature-256",
        },
      });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return await handleGet(req, url, admin, env);
    }

    if (req.method === "POST") {
      return await handlePost(req, url, admin, env);
    }

    console.error(LOG, "method not allowed", { method: req.method });
    return jsonResponse({ error: "method_not_allowed", method: req.method }, 405);
  } catch (err) {
    console.error(LOG, "unhandled exception", err);
    return jsonResponse({ error: "internal_error", detail: String(err) }, 500);
  }
});
