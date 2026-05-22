#!/usr/bin/env node
/**
 * Valida saída do `npm run build` antes do PM2 subir em produção.
 * Não use `vite preview` na VPS — use `npm run start` (srvx).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "dist/server/server.js",
  "dist/client/assets",
];

let failed = false;
for (const rel of required) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    console.error(`[verify-production-build] MISSING: ${rel}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nBuild incompleto. Rode: npm ci && npm run build\n" +
      "Em produção o PM2 deve executar: npm run start (srvx), NÃO vite preview nem node dist/server/server.js sozinho.\n",
  );
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const distRoot = resolve(root, "dist");
const bad = [];
for (const file of walk(distRoot)) {
  if (!/\.(js|mjs|html|json)$/i.test(file)) continue;
  const text = readFileSync(file, "utf8");
  // Chave real no bundle (não mensagens de erro genéricas)
  if (/sb_publishable_[A-Za-z0-9_-]+/.test(text)) bad.push(file.replace(root + "/", ""));
}

if (bad.length > 0) {
  console.error("[verify-production-build] ERRO: sb_publishable encontrado no build:");
  for (const f of bad.slice(0, 8)) console.error(`  - ${f}`);
  if (bad.length > 8) console.error(`  ... e mais ${bad.length - 8} arquivo(s)`);
  console.error(
    "\nRemova VITE_SUPABASE_PUBLISHABLE_KEY do .env, use só VITE_SUPABASE_ANON_KEY=eyJ..., limpe dist/.vite e rode npm run build de novo.\n",
  );
  process.exit(1);
}

const roleMasterPatterns = [
  /role:\s*["']master["']/,
  /headers:\s*\{[^}]*role:\s*["']master["']/,
  /"role"\s*:\s*"master"/,
];
const cadastroChunks = walk(resolve(root, "dist/client/assets")).filter((f) =>
  /cadastro-[^/]+\.js$/i.test(f),
);
for (const file of cadastroChunks) {
  const text = readFileSync(file, "utf8");
  if (/\bauthLoading\b/.test(text)) {
    console.error(
      `[verify-production-build] ERRO: authLoading no bundle ${file.replace(root + "/", "")}`,
    );
    console.error("O cadastro quebra em produção. Use isLoading do useAuth(), não authLoading.");
    process.exit(1);
  }
}

const roleMasterHits = [];
for (const file of walk(distRoot)) {
  if (!/\.(js|mjs|html)$/i.test(file)) continue;
  const text = readFileSync(file, "utf8");
  if (roleMasterPatterns.some((re) => re.test(text))) {
    roleMasterHits.push(file.replace(root + "/", ""));
  }
}
if (roleMasterHits.length > 0) {
  console.error("[verify-production-build] ERRO: possível role master no bundle:");
  for (const f of roleMasterHits.slice(0, 8)) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "[verify-production-build] OK — dist pronto (sem sb_publishable, sem authLoading, sem role master no client).",
);
