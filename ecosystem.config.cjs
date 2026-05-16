/**
 * PM2 (produção Linux). Uso na VPS após `npm ci` + `npm run build`:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Nginx deve fazer proxy para a porta definida em PORT (padrão 3000).
 */
module.exports = {
  apps: [
    {
      name: "beautyflow-studio",
      cwd: __dirname,
      script: "npm",
      args: "run start",
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
