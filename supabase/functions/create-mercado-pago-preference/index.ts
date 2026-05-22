import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getMercadoPagoTokenDeploymentError,
  looksLikeSandboxCheckoutUrl,
  resolveMercadoPagoCheckoutUrl,
  tokenModeLabel,
} from "../_shared/mercado-pago-env.ts";

const defaultCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

/** Origens explícitas (produção/staging), separadas por vírgula. Ex.: https://app.seudominio.com */
function loadAllowedOriginsSet(): Set<string> {
  const raw = Deno.env.get("ALLOWED_APP_ORIGINS")?.trim() ?? "";
  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const n = normalizeOrigin(part);
    if (n) set.add(n);
  }
  return set;
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/**
 * Localhost HTTP sempre permitido (dev). Demais origens só se estiverem em ALLOWED_APP_ORIGINS.
 * Em produção, defina ALLOWED_APP_ORIGINS com o domínio exato do app (sem barra final).
 */
function originIsPermitted(origin: string, allowed: Set<string>): boolean {
  const n = normalizeOrigin(origin);
  if (!n) return false;
  if (isLocalDevOrigin(n)) return true;
  return allowed.has(n);
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  if (origin) {
    return {
      ...defaultCorsHeaders,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }
  return { ...defaultCorsHeaders, "Access-Control-Allow-Origin": "*" };
}

type PreferenceItem = {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
};

Deno.serve(async (req) => {
  const allowedOrigins = loadAllowedOriginsSet();
  const headerOrigin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (headerOrigin && originIsPermitted(headerOrigin, allowedOrigins)) {
      return new Response("ok", { headers: corsHeadersFor(headerOrigin) });
    }
    return new Response("forbidden", { status: 403, headers: corsHeadersFor(null) });
  }

  try {
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!accessToken || !supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const tokenDeployErr = getMercadoPagoTokenDeploymentError(accessToken, allowedOrigins);
    if (tokenDeployErr) {
      console.error("[create-mercado-pago-preference]", tokenDeployErr);
      return new Response(JSON.stringify({ error: "mercado_pago_misconfigured" }), {
        status: 500,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as { payment_id?: string; origin?: string };
    const paymentId = body.payment_id?.trim();
    const origin = body.origin?.trim();
    const corsOk = headerOrigin && origin && normalizeOrigin(headerOrigin) === normalizeOrigin(origin);
    if (!paymentId || !origin || !originIsPermitted(origin, allowedOrigins) || !corsOk) {
      return new Response(JSON.stringify({ error: "invalid_request" }), {
        status: 400,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: pay, error: payErr } = await admin
      .from("payment_transactions")
      .select("id, company_id, status, amount")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !pay) {
      return new Response(JSON.stringify({ error: "payment_not_found" }), {
        status: 404,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    if (pay.status !== "pending") {
      return new Response(JSON.stringify({ error: "payment_not_pending" }), {
        status: 400,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await admin
      .from("company_users")
      .select("role")
      .eq("company_id", pay.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const amountNum = Number(pay.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return new Response(JSON.stringify({ error: "invalid_amount" }), {
        status: 400,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const base = origin.replace(/\/$/, "");
    const notificationBase = supabaseUrl.replace(/\/$/, "");
    const notificationUrl = `${notificationBase}/functions/v1/mercado-pago-webhook`;

    const items: PreferenceItem[] = [
      {
        title: "BeautyFlow — assinatura do plano",
        quantity: 1,
        unit_price: Math.round(amountNum * 100) / 100,
        currency_id: "BRL",
      },
    ];

    const preferenceBody = {
      items,
      external_reference: String(pay.id),
      metadata: { payment_id: String(pay.id), company_id: String(pay.company_id) },
      back_urls: {
        success: `${base}/admin/plano?checkout=success`,
        failure: `${base}/admin/plano?checkout=failure`,
        pending: `${base}/admin/plano?checkout=pending`,
      },
      auto_return: "approved",
      notification_url: notificationUrl,
      payment_methods: {
        installments: 12,
        default_installments: 1,
      },
      binary_mode: false,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error("mercado pago preference error", mpRes.status, errText);
      return new Response(JSON.stringify({ error: "mercado_pago_error" }), {
        status: 502,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const preference = (await mpRes.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    const prefId = preference.id;
    const { url: redirectUrl, mode: mpMode, usedField } = resolveMercadoPagoCheckoutUrl(
      preference,
      accessToken,
    );

    console.log(
      `[create-mercado-pago-preference] token_mode=${tokenModeLabel(accessToken)} redirect_field=${usedField} preference_id=${prefId ?? "?"}`,
    );

    if (!prefId || !redirectUrl) {
      console.error(
        "mercado pago missing checkout url",
        { mpMode, usedField, has_init: Boolean(preference.init_point), has_sandbox: Boolean(preference.sandbox_init_point) },
      );
      return new Response(JSON.stringify({ error: "mercado_pago_invalid_response" }), {
        status: 502,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    if (mpMode === "production" && looksLikeSandboxCheckoutUrl(redirectUrl)) {
      console.error("[create-mercado-pago-preference] production token but sandbox checkout URL", redirectUrl);
      return new Response(JSON.stringify({ error: "mercado_pago_sandbox_url_in_production" }), {
        status: 502,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await admin
      .from("payment_transactions")
      .update({
        gateway_provider: "mercado_pago",
        mp_preference_id: prefId,
        gateway_metadata: {
          mp_preference_id: prefId,
          created_at: new Date().toISOString(),
        },
      })
      .eq("id", pay.id);

    if (updErr) {
      console.error(updErr);
      return new Response(JSON.stringify({ error: "db_update_failed" }), {
        status: 500,
        headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: redirectUrl }), {
      headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeadersFor(headerOrigin), "Content-Type": "application/json" },
    });
  }
});
