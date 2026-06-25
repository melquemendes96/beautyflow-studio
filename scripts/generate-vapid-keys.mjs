/**
 * Gera par de chaves VAPID para Web Push.
 * Uso: node scripts/generate-vapid-keys.mjs
 */
import crypto from "node:crypto";

function exportPublicKeyRaw(publicKey) {
  const spki = publicKey.export({ type: "spki", format: "der" });
  return spki.subarray(spki.length - 65);
}

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

const publicB64 = toBase64Url(exportPublicKeyRaw(publicKey));
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });

console.log("Adicione ao .env (frontend) e Supabase Edge secrets:\n");
console.log(`VITE_VAPID_PUBLIC_KEY=${publicB64}`);
console.log(`VAPID_PUBLIC_KEY=${publicB64}`);
console.log(`VAPID_PRIVATE_KEY=${privatePem.replace(/\n/g, "\\n")}`);
console.log("VAPID_SUBJECT=mailto:seu@email.com");
console.log("PUSH_INTERNAL_SECRET=<gere um uuid ou string aleatoria longa>");
console.log("\nDepois no SQL Editor (substitua valores):");
console.log(`UPDATE public.platform_push_config SET
  functions_base_url = 'https://SEU_REF.supabase.co',
  internal_secret = 'MESMO_PUSH_INTERNAL_SECRET',
  updated_at = now()
WHERE id = 1;`);
