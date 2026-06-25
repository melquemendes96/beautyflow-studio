/**
 * Web Push — entrega para admin/equipe (VAPID).
 * Auth: header/body secret (PUSH_INTERNAL_SECRET) ou service role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

const LOG = "[deliver-web-push]";

type PushPayload = {
  mode?: "direct" | "process_outbox";
  secret?: string;
  company_id?: string;
  title?: string;
  body?: string;
  url?: string;
  limit?: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type OutboxRow = {
  id: string;
  company_id: string;
  title: string;
  body: string;
  url: string;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function configureVapid(): boolean {
  const subject = Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:suporte@jmbeautyflow.tech";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim() || Deno.env.get("VITE_VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  if (!publicKey || !privateKey) {
    console.error(LOG, "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ausentes");
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendToCompany(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  title: string,
  body: string,
  url: string,
): Promise<{ sent: number; failed: number; removed: number }> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("company_id", companyId);

  if (error) {
    console.error(LOG, "load subscriptions", error.message);
    return { sent: 0, failed: 0, removed: 0 };
  }

  const payload = JSON.stringify({
    title,
    body,
    url: url || "/admin/agenda",
    icon: "/logo-beautyflow.png",
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        { TTL: 86400 },
      );
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed += 1;
      }
      console.warn(LOG, "send failed", sub.endpoint.slice(0, 48), status, String(e));
    }
  }

  return { sent, failed, removed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, authorization, x-push-secret",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const internalSecret = Deno.env.get("PUSH_INTERNAL_SECRET")?.trim() ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  let body: PushPayload;
  try {
    body = (await req.json()) as PushPayload;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const headerSecret = req.headers.get("x-push-secret")?.trim() ?? "";
  const bodySecret = body.secret?.trim() ?? "";
  const provided = headerSecret || bodySecret;

  const serviceAuth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = serviceAuth === serviceKey;

  if (!isServiceRole) {
    if (!internalSecret || !provided || !secretsMatch(provided, internalSecret)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
  }

  if (!configureVapid()) {
    return json({ ok: false, error: "vapid_not_configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (body.mode === "process_outbox") {
    const limit = Math.min(Math.max(body.limit ?? 30, 1), 100);
    const { data: rows, error } = await supabase
      .from("push_notification_outbox")
      .select("id,company_id,title,body,url")
      .is("delivered_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    let totalSent = 0;
    for (const row of (rows ?? []) as OutboxRow[]) {
      const result = await sendToCompany(supabase, row.company_id, row.title, row.body, row.url);
      totalSent += result.sent;
      await supabase
        .from("push_notification_outbox")
        .update({
          delivered_at: new Date().toISOString(),
          delivery_error: result.sent > 0 ? null : "sem_subscriptions_ou_falha",
        })
        .eq("id", row.id);
    }

    return json({ ok: true, processed: (rows ?? []).length, sent: totalSent });
  }

  const companyId = body.company_id?.trim();
  const title = body.title?.trim();
  const msgBody = body.body?.trim();
  if (!companyId || !title || !msgBody) {
    return json({ ok: false, error: "dados_incompletos" }, 400);
  }

  const result = await sendToCompany(supabase, companyId, title, msgBody, body.url?.trim() || "/admin/agenda");
  return json({ ok: true, ...result });
});
