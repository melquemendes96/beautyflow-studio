/**
 * PM2 — produção VPS (Ubuntu + Nginx).
 *
 * IMPORTANTE:
 * - dist/server/server.js é o handler SSR (export fetch), NÃO um servidor HTTP.
 * - NUNCA rode: node dist/server/server.js | npm run preview
 * - SEMPRE rode: npm run start  →  srvx escuta PORT (padrão 3000)
 *
 * Após git pull:
 *   npm ci && npm run build && pm2 reload ecosystem.config.cjs --update-env
 */
const path = require("node:path");

const appRoot = __dirname;
const srvxBin = path.join(appRoot, "node_modules", "srvx", "bin", "srvx.mjs");

module.exports = {
  apps: [
    {
      name: "beautyflow-studio",
      cwd: appRoot,
      script: srvxBin,
      interpreter: "node",
      args: "serve --prod --dir ./dist/server --static ../client --host 0.0.0.0 --port 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      max_memory_restart: "768M",
      time: true,
      merge_logs: true,
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "0.0.0.0",
      },
    },
  ],
};
