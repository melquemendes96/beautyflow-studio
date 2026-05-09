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
  const mpPayment = await fetchPayment(accessToken, paymentResourceId);
  if (!mpPayment) {
    return new Response("payment fetch failed", { status: 502 });
  }

  const extRef = mpPayment.external_reference?.trim();
  if (!extRef) {
    console.error("mp payment without external_reference", mpPayment.id);
    return new Response(JSON.stringify({ received: true, skipped: "no_external_reference" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      return new Response("rpc error", { status: 500 });
    }
    const result = data as { ok?: boolean };
    if (result?.ok === false) {
      console.error("service_apply_payment_renewal", data);
      return new Response("renewal failed", { status: 500 });
    }
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
      return new Response("reject rpc error", { status: 500 });
    }
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
      console.log("[mercado-pago-webhook] GET payment notification id=", qId);
      return processApprovedOrRejectedPayment(admin, accessToken, String(qId).trim());
    }
    return new Response("ok", { status: 200 });
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    bodyUnknown = null;
  }

  const paymentResourceId = parsePaymentIdFromRequest(req, bodyUnknown);
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
