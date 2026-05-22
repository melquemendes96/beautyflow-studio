/**
 * Modo Mercado Pago derivado do access token (Edge Functions).
 * Produção: APP_USR-* → init_point
 * Teste: TEST-* → sandbox_init_point
 */

export type MercadoPagoTokenMode = "production" | "test";

export type MpPreferenceUrls = {
  init_point?: string;
  sandbox_init_point?: string;
};

export function getMercadoPagoTokenMode(accessToken: string): MercadoPagoTokenMode {
  const t = accessToken.trim();
  if (t.toUpperCase().startsWith("TEST-")) return "test";
  return "production";
}

export function tokenModeLabel(accessToken: string): string {
  return getMercadoPagoTokenMode(accessToken);
}

/**
 * URL de redirecionamento Checkout Pro conforme o token configurado em MERCADO_PAGO_ACCESS_TOKEN.
 */
export function resolveMercadoPagoCheckoutUrl(
  preference: MpPreferenceUrls,
  accessToken: string,
): { url: string | null; mode: MercadoPagoTokenMode; usedField: "init_point" | "sandbox_init_point" | "none" } {
  const mode = getMercadoPagoTokenMode(accessToken);

  if (mode === "test") {
    if (preference.sandbox_init_point) {
      return { url: preference.sandbox_init_point, mode, usedField: "sandbox_init_point" };
    }
    if (preference.init_point) {
      return { url: preference.init_point, mode, usedField: "init_point" };
    }
    return { url: null, mode, usedField: "none" };
  }

  if (preference.init_point) {
    return { url: preference.init_point, mode, usedField: "init_point" };
  }
  return { url: null, mode, usedField: "none" };
}

/** Produção não deve redirecionar para host de sandbox. */
export function looksLikeSandboxCheckoutUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("sandbox") || lower.includes("test.mercadopago");
}

/**
 * TEST-* com ALLOWED_APP_ORIGINS de produção → misconfig (evita cobrança de teste no domínio real).
 */
export function getMercadoPagoTokenDeploymentError(
  accessToken: string,
  allowedOrigins: Set<string>,
): string | null {
  if (getMercadoPagoTokenMode(accessToken) !== "test") return null;
  const hasProdOrigin = [...allowedOrigins].some(
    (o) => o.startsWith("https://") && !o.includes("localhost") && !o.includes("127.0.0.1"),
  );
  if (hasProdOrigin) {
    return (
      "MERCADO_PAGO_ACCESS_TOKEN is TEST- but ALLOWED_APP_ORIGINS includes production URLs. " +
      "Use APP_USR (produção) in Supabase Edge secrets for jmbeautyflow.tech."
    );
  }
  return null;
}
