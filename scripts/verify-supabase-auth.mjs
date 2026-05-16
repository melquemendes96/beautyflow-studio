/**
 * Verifica RPC, platform_admins e chave anon.
 * Uso: node scripts/verify-supabase-auth.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env");
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon?.startsWith("eyJ")) {
  console.error("ERRO: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (eyJ...) no .env");
  process.exit(1);
}

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  "Content-Type": "application/json",
};

console.log("Projeto:", url);

const rpcRes = await fetch(`${url}/rest/v1/rpc/get_auth_panel_context`, {
  method: "POST",
  headers,
  body: "{}",
});
console.log("RPC get_auth_panel_context (anon):", rpcRes.status, await rpcRes.text());

const adminsRes = await fetch(
  `${url}/rest/v1/platform_admins?select=user_id,created_at&limit=5`,
  { headers },
);
console.log("platform_admins (anon, sem login):", adminsRes.status, await adminsRes.text());

console.log("\nSe RPC retornar 404/PGRST202, aplique supabase/migrations/20260516310000_definitive_master_auth.sql");
console.log("Se platform_admins estiver vazio, rode o INSERT da mesma migration.");
console.log("Depois: login Google e confira no app.");
