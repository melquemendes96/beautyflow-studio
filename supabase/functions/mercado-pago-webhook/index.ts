import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type MpPayment = {
  id?: number | string;
  status?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Extrai o ID do recurso **payment** (cobrança) para buscar em /v1/payments/:id.
 * Ignora de propósito: subscription_preapproval, merchant_order sem payment, etc.
 * O simulador do painel MP ("Planos e assinaturas") envia subscription_preapproval — isso retorna null aqui.
 */
function parsePaymentIdFromRequest(req: Request, bodyUnknown: unknown): string | null {
  const url = new URL(req.url);
  const qTopic = (url.searchParams.get("topic") ?? url.searchParams.get("type") ?? "").toLowerCase();
  const qId = url.searchParams.get("id") ?? url.searchParams.get("data.id");
  if (qTopic === "payment" && qId) return String(qId).trim();

  if (!bodyUnknown || typeof bodyUnknown !== "object") return null;
  const body = bodyUnknown as Record<string, unknown>;
  const data = body.data as Record<string, unknown> | undefined;
  const dataId = data?.id != null ? String(data.id).trim() : null;

  if (body.type === "payment" && dataId) return dataId;

  const action = String(body.action ?? "");
  if (action.startsWith("payment.") && dataId) return dataId;

  return null;
}

/** ID usado no manifest da assinatura x-signature (Mercado Pago). */
function extractDataIdForSignature(
  url: URL,
  bodyUnknown: unknown,
  paymentResourceId: string | null,
): string | null {
  if (paymentResourceId) return paymentResourceId;
  if (bodyUnknown && typeof bodyUnknown === "object") {
    const data = (bodyUnknown as Record<string, unknown>).data;
    if (data && typeof data === "object" && (data as Record<string, unknown>).id != null) {
      return String((data as Record<string, unknown>).id).trim();
    }
  }
  const q = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  return q ? String(q).trim() : null;
}

function parseMpSignatureHeader(xSignature: string): { ts: string; v1: string } | null {
  let ts = "";
  let v1 = "";
  for (const part of xSignature.split(",")) {
    const [k, ...rest] = part.split("=");
    if (!k || rest.length === 0) continue;
    const key = k.trim();
    const value = rest.join("=").trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  return ts && v1 ? { ts, v1 } : null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
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

/**
 * Valida notificação Mercado Pago (HMAC-SHA256) quando MERCADO_PAGO_WEBHOOK_SECRET está definido.
 * @see https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
async function assertMercadoPagoSignature(
  req: Request,
  url: URL,
  bodyUnknown: unknown,
  paymentResourceId: string | null,
  webhookSecret: string,
): Promise<Response | null> {
  const xSignature = req.headers.get("x-signature") ?? req.headers.get("X-Signature");
  const xRequestId = req.headers.get("x-request-id") ?? req.headers.get("X-Request-Id") ?? "";

  if (!xSignature) {
    return new Response(JSON.stringify({ error: "missing_x_signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = parseMpSignatureHeader(xSignature);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "invalid_x_signature_format" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dataId = extractDataIdForSignature(url, bodyUnknown, paymentResourceId);
  if (!dataId) {
    return new Response(JSON.stringify({ error: "cannot_verify_signature_without_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parsed.ts};`;
  const expectedHex = await hmacSha256Hex(webhookSecret, manifest);
  if (!timingSafeEqualHex(expectedHex, parsed.v1)) {
    console.error("[mercado-pago-webhook] signature mismatch");
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

const SENSITIVE_PAYLOAD_KEYS = new Set([
  "email",
  "payer_email",
  "card",
  "card_number",
  "security_code",
  "token",
  "access_token",
  "authorization",
  "document",
  "identification",
  "cpf",
  "cnpj",
  "phone",
  "password",
  "secret",
]);

function sanitizePaymentLogPayload(input: unknown): Record<string, unknown> {
  if (input == null) return {};
  if (typeof input !== "object") return { value: String(input).slice(0, 200) };

  const walk = (obj: Record<string, unknown>, depth: number): Record<string, unknown> => {
    if (depth > 4) return { truncated: true };
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const k = key.toLowerCase();
      if (SENSITIVE_PAYLOAD_KEYS.has(k) || k.includes("email") || k.includes("document")) {
        out[key] = "[redacted]";
        continue;
      }
      if (val == null || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        out[key] = typeof val === "string" ? val.slice(0, 500) : val;
      } else if (Array.isArray(val)) {
        out[key] = val.slice(0, 8).map((item) =>
          typeof item === "object" && item !== null
            ? walk(item as Record<string, unknown>, depth + 1)
            : item,
        );
      } else if (typeof val === "object") {
        out[key] = walk(val as Record<string, unknown>, depth + 1);
      }
    }
    return out;
  };

  return walk(input as Record<string, unknown>, 0);
}

async function insertPaymentLog(
  admin: SupabaseClient,
  row: {
    company_id?: string | null;
    event: string;
    status?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("payment_logs").insert({
      company_id: row.company_id ?? null,
      event: row.event,
      status: row.status ?? null,
      payload: sanitizePaymentLogPayload(row.payload ?? {}),
    });
    if (error) console.error("[mercado-pago-webhook] payment_logs:", error.message);
  } catch (e) {
    console.error("[mercado-pago-webhook] payment_logs insert failed", e);
  }
}

async function resolveCompanyIdFromPaymentRow(
  admin: SupabaseClient,
  paymentRowId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("payment_transactions")
    .select("company_id")
    .eq("id", paymentRowId)
    .maybeSingle();
  return data?.company_id ?? null;
}

async function fetchPayment(accessToken: string, paymentId: string): Promise<MpPayment | null> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("mp fetch payment", res.status, await res.text());
    return null;
  }
  return (await res.json()) as MpPayment;
}

async function processApprovedOrRejectedPayment(
  admin: SupabaseClient,
  accessToken: string,
  paymentResourceId: string,
): Promise<Response> {
  await insertPaymentLog(admin, {
    event: "webhook_payment_received",
    status: "processing",
    payload: { mp_payment_id: paymentResourceId },
  });

  const mpPayment = await fetchPayment(accessToken, paymentResourceId);
  if (!mpPayment) {
    await insertPaymentLog(admin, {
      event: "mp_payment_fetch_failed",
      status: "error",
      payload: { mp_payment_id: paymentResourceId },
    });
    return new Response("payment fetch failed", { status: 502 });
  }

  const extRef = mpPayment.external_reference?.trim();
  if (!extRef) {
    console.error("mp payment without external_reference", mpPayment.id);
    await insertPaymentLog(admin, {
      event: "mp_payment_no_external_reference",
      status: "skipped",
      payload: {
        mp_payment_id: String(mpPayment.id ?? paymentResourceId),
        mp_status: mpPayment.status ?? null,
      },
    });
    return new Response(JSON.stringify({ received: true, skipped: "no_external_reference" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const companyId = await resolveCompanyIdFromPaymentRow(admin, extRef);

  const { data: existingRow } = await admin
    .from("payment_transactions")
    .select("gateway_metadata")
    .eq("id", extRef)
    .maybeSingle();

  const prevMeta =
    existingRow?.gateway_metadata &&
    typeof existingRow.gateway_metadata === "object" &&
    !Array.isArray(existingRow.gateway_metadata)
      ? { ...(existingRow.gateway_metadata as Record<string, unknown>) }
      : {};

  const mergedMeta: Record<string, unknown> = {
    ...prevMeta,
    mp_payment_id: String(mpPayment.id ?? paymentResourceId),
    mp_status: mpPayment.status ?? null,
    last_webhook_at: new Date().toISOString(),
  };

  await admin
    .from("payment_transactions")
    .update({
      mp_payment_id: String(mpPayment.id ?? paymentResourceId),
      gateway_metadata: mergedMeta,
    })
    .eq("id", extRef);

  const status = (mpPayment.status ?? "").toLowerCase();

  if (status === "approved" || status === "authorized") {
    const { data, error } = await admin.rpc("service_apply_payment_renewal", {
      p_payment_id: extRef,
      p_months: 1,
    });
    if (error) {
      console.error(error);
      await insertPaymentLog(admin, {
        company_id: companyId,
        event: "payment_renewal_rpc_error",
        status: "error",
        payload: {
          payment_transaction_id: extRef,
          mp_payment_id: String(mpPayment.id ?? paymentResourceId),
          mp_status: status,
          error: error.message,
        },
      });
      return new Response("rpc error", { status: 500 });
    }
    const result = data as { ok?: boolean };
    if (result?.ok === false) {
      console.error("service_apply_payment_renewal", data);
      await insertPaymentLog(admin, {
        company_id: companyId,
        event: "payment_renewal_failed",
        status: "error",
        payload: {
          payment_transaction_id: extRef,
          mp_payment_id: String(mpPayment.id ?? paymentResourceId),
          mp_status: status,
          result: data,
        },
      });
      return new Response("renewal failed", { status: 500 });
    }
    await insertPaymentLog(admin, {
      company_id: companyId,
      event: "payment_approved",
      status: "approved",
      payload: {
        payment_transaction_id: extRef,
        mp_payment_id: String(mpPayment.id ?? paymentResourceId),
        mp_status: status,
      },
    });
  } else if (
    status === "rejected" ||
    status === "cancelled" ||
    status === "refunded" ||
    status === "charged_back"
  ) {
    const { error } = await admin.rpc("service_mark_payment_rejected", {
      p_payment_id: extRef,
      p_mp_payment_id: String(mpPayment.id ?? paymentResourceId),
    });
    if (error) {
      console.error(error);
      await insertPaymentLog(admin, {
        company_id: companyId,
        event: "payment_reject_rpc_error",
        status: "error",
        payload: {
          payment_transaction_id: extRef,
          mp_payment_id: String(mpPayment.id ?? paymentResourceId),
          mp_status: status,
          error: error.message,
        },
      });
      return new Response("reject rpc error", { status: 500 });
    }
    await insertPaymentLog(admin, {
      company_id: companyId,
      event: "payment_rejected",
      status,
      payload: {
        payment_transaction_id: extRef,
        mp_payment_id: String(mpPayment.id ?? paymentResourceId),
        mp_status: status,
      },
    });
  } else {
    await insertPaymentLog(admin, {
      company_id: companyId,
      event: "payment_status_other",
      status,
      payload: {
        payment_transaction_id: extRef,
        mp_payment_id: String(mpPayment.id ?? paymentResourceId),
        mp_status: status,
      },
    });
  }

  return new Response(JSON.stringify({ received: true, processed: "payment", payment_id: paymentResourceId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")?.trim() ?? "";

  if (!accessToken || !supabaseUrl || !serviceKey) {
    return new Response("misconfigured", { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);

  // Health / IPN legado: GET ?topic=payment&id=...
  if (req.method === "GET" || req.method === "HEAD") {
    const qTopic = (url.searchParams.get("topic") ?? url.searchParams.get("type") ?? "").toLowerCase();
    const qId = url.searchParams.get("id") ?? url.searchParams.get("data.id");
    if (req.method === "GET" && qTopic === "payment" && qId) {
      if (webhookSecret) {
        const xSig = req.headers.get("x-signature") ?? req.headers.get("X-Signature");
        if (xSig) {
          const getErr = await assertMercadoPagoSignature(
            req,
            url,
            null,
            String(qId).trim(),
            webhookSecret,
          );
          if (getErr) return getErr;
        } else {
          console.warn(
            "[mercado-pago-webhook] GET IPN sem x-signature — aceito para compatibilidade com IPN legado Mercado Pago.",
          );
        }
      }
      console.log("[mercado-pago-webhook] GET payment notification id=", qId);
      return processApprovedOrRejectedPayment(admin, accessToken, String(qId).trim());
    }
    return new Response("ok", { status: 200 });
  }

  const rawBody = await req.text();
  let bodyUnknown: unknown = null;
  try {
    bodyUnknown = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    bodyUnknown = null;
  }

  const paymentResourceId = parsePaymentIdFromRequest(req, bodyUnknown);

  if (webhookSecret) {
    const sigErr = await assertMercadoPagoSignature(req, url, bodyUnknown, paymentResourceId, webhookSecret);
    if (sigErr) return sigErr;
  }

  if (!paymentResourceId) {
    const hint =
      bodyUnknown && typeof bodyUnknown === "object"
        ? (bodyUnknown as Record<string, unknown>).type ??
          (bodyUnknown as Record<string, unknown>).entity ??
          "unknown"
        : "empty_body";
    console.log(
      "[mercado-pago-webhook] ignored (not a payment resource — assinatura BeautyFlow usa Checkout Pro + webhook de payment). hint=",
      hint,
    );
    await insertPaymentLog(admin, {
      event: "webhook_ignored",
      status: "ignored",
      payload: sanitizePaymentLogPayload(
        bodyUnknown && typeof bodyUnknown === "object"
          ? { hint, ...(bodyUnknown as Record<string, unknown>) }
          : { hint },
      ),
    });
    return new Response(
      JSON.stringify({
        received: true,
        ignored: true,
        reason:
          "Este endpoint só processa notificações do tipo payment (id da cobrança). Simulações de subscription_preapproval no painel MP retornam 200 mas não alteram o banco.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log("[mercado-pago-webhook] processing payment id=", paymentResourceId);
  return processApprovedOrRejectedPayment(admin, accessToken, paymentResourceId);
});
