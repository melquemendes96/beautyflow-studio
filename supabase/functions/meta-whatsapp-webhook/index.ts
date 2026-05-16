/**
 * Webhook oficial Meta Cloud API (WhatsApp Business).
 * Multi-tenant: use URL com ?company_id=<uuid da empresa> ao cadastrar no Meta Developer.
 *
 * GET: verificação hub.challenge (hub.verify_token deve bater com whatsapp_connections.webhook_verify_token).
 * POST: valida X-Hub-Signature-256 quando META_APP_SECRET está definido.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

async function assertMetaSignature(
  req: Request,
  rawBody: string,
  appSecret: string,
): Promise<Response | null> {
  const sigHeader =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");
  if (!sigHeader?.startsWith("sha256=")) {
    return new Response(JSON.stringify({ error: "missing_signature" }), { status: 401 });
  }
  const expectedHex = sigHeader.slice("sha256=".length).trim();
  const actualHex = await hmacSha256Hex(appSecret, rawBody);
  if (!timingSafeEqualHex(expectedHex, actualHex)) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 403 });
  }
  return null;
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);

  if (req.method === "GET" || req.method === "HEAD") {
    if (req.method === "HEAD") return new Response(null, { status: 200 });

    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const companyId = url.searchParams.get("company_id");

    if (mode === "subscribe" && verifyToken && challenge && companyId) {
      const { data, error } = await admin
        .from("whatsapp_connections")
        .select("webhook_verify_token")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) {
        console.error("[meta-whatsapp-webhook] verify lookup", error);
        return new Response("error", { status: 500 });
      }

      const expected = data?.webhook_verify_token?.trim() ?? "";
      if (expected && timingSafeEqualStrPlain(verifyToken, expected)) {
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return new Response("Forbidden", { status: 403 });
    }

    return new Response(JSON.stringify({ ok: true, hint: "meta_whatsapp_webhook" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET")?.trim() ?? "";

  if (appSecret) {
    const sigErr = await assertMetaSignature(req, rawBody, appSecret);
    if (sigErr) return sigErr;
  } else {
    console.warn(
      "[meta-whatsapp-webhook] META_APP_SECRET ausente — assinatura não validada (não use em produção).",
    );
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  console.log("[meta-whatsapp-webhook] POST received", {
    hasPayload: payload != null,
    company_hint: url.searchParams.get("company_id"),
  });

  // Placeholder: futura roteamento por entry[].changes[] e gravação em whatsapp_message_logs
  return new Response(
    JSON.stringify({ received: true, processed: false, note: "ingestão Cloud API preparada" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});

function timingSafeEqualStrPlain(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
