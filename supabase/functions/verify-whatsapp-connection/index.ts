/**
 * Testa credenciais Meta (Graph API) para a empresa — admin autenticado.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const LOG = "[verify-whatsapp-connection]";
const GRAPH_API_VERSION = "v21.0";

type Body = { company_id?: string };

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return jsonResponse({ error: "misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const jwt = authHeader.slice(7).trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const companyId = body.company_id?.trim();
  if (!companyId) {
    return jsonResponse({ error: "company_id_required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const userId = userData.user.id;

  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!platformAdmin) {
    const { data: membership } = await admin
      .from("company_users")
      .select("role")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();

    const role = String(membership?.role ?? "");
    if (role !== "owner" && role !== "admin") {
      return jsonResponse({ error: "forbidden" }, 403);
    }
  }

  const { data: conn, error: connErr } = await admin
    .from("whatsapp_connections")
    .select("phone_number_id, access_token_encrypted, status, display_phone_number")
    .eq("company_id", companyId)
    .maybeSingle();

  if (connErr || !conn) {
    return jsonResponse({ ok: false, error: "connection_not_found" }, 404);
  }

  const token = conn.access_token_encrypted?.trim() || Deno.env.get("WHATSAPP_TOKEN")?.trim() || "";
  const phoneNumberId =
    conn.phone_number_id?.trim() || Deno.env.get("PHONE_NUMBER_ID")?.trim() || "";

  if (!token || !phoneNumberId) {
    return jsonResponse({ ok: false, error: "missing_credentials" }, 422);
  }

  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;

  const graphRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const graphJson = await graphRes.json().catch(() => ({}));

  if (!graphRes.ok) {
    const errMsg =
      (graphJson as { error?: { message?: string; code?: number } })?.error?.message ??
      `graph_http_${graphRes.status}`;
    console.error(LOG, "graph error", graphJson);
    return jsonResponse({ ok: false, error: "meta_api_failed", detail: errMsg }, 502);
  }

  return jsonResponse({
    ok: true,
    connection_status: conn.status,
    display_phone_number:
      (graphJson as { display_phone_number?: string }).display_phone_number ??
      conn.display_phone_number,
    verified_name: (graphJson as { verified_name?: string }).verified_name ?? null,
    quality_rating: (graphJson as { quality_rating?: string }).quality_rating ?? null,
  });
});
