/** Mensagem legível para erros Supabase/PostgREST no painel master. */
export function formatSupabaseApiError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Erro desconhecido ao comunicar com o Supabase.";
  }

  const e = error as { message?: string; status?: number; code?: string; details?: string };
  const code = String(e.code ?? "");
  const status = e.status ?? (code === "PGRST301" ? 401 : undefined);
  const msg = String(e.message ?? "").trim();

  if (status === 401 || code === "PGRST301") {
    return "401 — Sessão inválida ou chave errada no build. Use VITE_SUPABASE_ANON_KEY (JWT eyJ...) e refaça npm run build na VPS.";
  }
  if (msg.includes('role "master" does not exist')) {
    return (
      'PostgreSQL: role "master" não existe — não é envio do frontend. ' +
      "Execute supabase/scripts/fix_master_plans_apply_now.sql no SQL Editor (OWNER das funções = postgres)."
    );
  }
  if (status === 403 || code === "42501") {
    return "403 — Sem permissão de platform_admin. Confirme seu e-mail em platform_admins no Supabase.";
  }
  if (code === "PGRST202" || msg.includes("Could not find the function")) {
    if (msg.includes("consume_client_package_session")) {
      return "RPC consume_client_package_session ausente — aplique a migration supabase/migrations/20260608000000_fix_package_session_on_close.sql no Supabase.";
    }
    if (msg.includes("list_provider_payouts") || msg.includes("provider_commission_balance")) {
      return "RPC de repasses ausente — aplique apply_comandas_phases_345_full.sql e 20260613000002_fix_provider_payouts_balance.sql no Supabase.";
    }
    return "PGRST202 — RPC ausente neste projeto. Execute a migration correspondente no SQL Editor do Supabase.";
  }
  if (status === 404 || code === "PGRST116") {
    return "404 — Recurso não encontrado. Verifique se o .env aponta para o projeto Supabase correto.";
  }

  if (msg) return msg;
  if (code) return `Erro Supabase (${code}).`;
  if (status) return `Erro HTTP ${status}.`;
  return "Falha na requisição ao Supabase.";
}
