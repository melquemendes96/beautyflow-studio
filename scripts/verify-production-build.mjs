#!/usr/bin/env node
/**
 * Valida saída do `npm run build` antes do PM2 subir em produção.
 * Não use `vite preview` na VPS — use `npm run start` (srvx).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

console.log("[verify-production-build] OK — dist/server/server.js + dist/client prontos para srvx.");
