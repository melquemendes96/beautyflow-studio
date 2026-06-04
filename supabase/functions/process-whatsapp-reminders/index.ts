/**
 * Cron: enfileira lembretes WhatsApp 24h e dispara envio via send-whatsapp-message.
 * Auth: header X-Cron-Secret = WHATSAPP_CRON_SECRET (ou service role key).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const LOG = "[process-whatsapp-reminders]";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isAuthorized(req: Request, serviceKey: string): boolean {
  const cronSecret = Deno.env.get("WHATSAPP_CRON_SECRET")?.trim();
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  if (cronSecret && headerSecret && cronSecret === headerSecret) return true;

  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(auth && serviceKey && auth === serviceKey);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "misconfigured" }, 500);
  }

  if (!isAuthorized(req, serviceKey)) {
    console.warn(LOG, "unauthorized cron invocation");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data, error } = await admin.rpc("enqueue_whatsapp_reminders_due");
  if (error) {
    console.error(LOG, "enqueue failed", error);
    return jsonResponse({ error: "enqueue_failed", detail: error.message }, 500);
  }

  const payload = (data ?? {}) as {
    ok?: boolean;
    target_date?: string;
    enqueued_count?: number;
    log_ids?: string[];
  };

  const logIds = Array.isArray(payload.log_ids) ? payload.log_ids : [];
  const sendResults: Array<{ log_id: string; ok: boolean; detail?: string }> = [];

  for (const logId of logIds) {
    try {
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ log_id: logId }),
      });

      const sendJson = await sendRes.json().catch(() => ({}));
      sendResults.push({
        log_id: logId,
        ok: sendRes.ok,
        detail: sendRes.ok ? undefined : String((sendJson as { error?: string }).error ?? sendRes.status),
      });
    } catch (err) {
      sendResults.push({
        log_id: logId,
        ok: false,
        detail: err instanceof Error ? err.message : "send_failed",
      });
    }
  }

  const sentOk = sendResults.filter((r) => r.ok).length;
  console.log(LOG, "done", {
    target_date: payload.target_date,
    enqueued: logIds.length,
    sent_ok: sentOk,
  });

  return jsonResponse({
    ok: true,
    target_date: payload.target_date,
    enqueued_count: payload.enqueued_count ?? logIds.length,
    sent_ok: sentOk,
    send_results: sendResults,
  });
});
