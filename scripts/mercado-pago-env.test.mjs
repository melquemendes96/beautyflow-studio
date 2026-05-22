/**
 * Regras de redirect Checkout Pro (espelha supabase/functions/_shared/mercado-pago-env.ts).
 * node scripts/mercado-pago-env.test.mjs
 */
import assert from "node:assert/strict";

function getMercadoPagoTokenMode(accessToken) {
  if (accessToken.trim().toUpperCase().startsWith("TEST-")) return "test";
  return "production";
}

function resolveMercadoPagoCheckoutUrl(preference, accessToken) {
  const mode = getMercadoPagoTokenMode(accessToken);
  if (mode === "test") {
    return preference.sandbox_init_point ?? preference.init_point ?? null;
  }
  return preference.init_point ?? null;
}

const prodToken = "APP_USR-1234567890";
const testToken = "TEST-1234567890";

const pref = {
  init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref=prod",
  sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref=test",
};

assert.equal(
  resolveMercadoPagoCheckoutUrl(pref, prodToken),
  pref.init_point,
  "production must use init_point",
);
assert.equal(
  resolveMercadoPagoCheckoutUrl(pref, testToken),
  pref.sandbox_init_point,
  "test must use sandbox_init_point",
);
assert.equal(
  resolveMercadoPagoCheckoutUrl({ init_point: pref.init_point }, prodToken),
  pref.init_point,
  "production without sandbox field",
);
assert.equal(
  resolveMercadoPagoCheckoutUrl({ sandbox_init_point: pref.sandbox_init_point }, prodToken),
  null,
  "production must not fall back to sandbox",
);

console.log("mercado-pago-env: all tests passed");
