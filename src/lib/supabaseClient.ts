import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para o browser e para SSR (TanStack Start).
 * Usa apenas a chave publicável (anon); nunca service_role no front.
 *
 * No servidor, cada chamada obtém uma nova instância para não compartilhar estado de auth entre requests.
 */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
/** Documentação Supabase costuma usar "anon key"; aceitamos os dois nomes. */
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

/** ID do projeto (opcional), útil para suporte e logs. */
export const supabaseProjectId: string =
  (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "";

let browserClient: SupabaseClient | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey);
}

/** Referência do projeto na URL (ex.: rfdphonjgsmyeqnsfjom). */
export function getSupabaseProjectRef(): string | null {
  if (!url) return null;
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

function createSupabaseClient(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) no .env na raiz do projeto. Reinicie o npm run dev após salvar.",
    );
  }

  const isBrowser = typeof document !== "undefined";

  return createClient(url as string, publishableKey as string, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  });
}

/** Retorna o cliente Supabase. Lança se as variáveis de ambiente não estiverem definidas. */
export function getSupabase(): SupabaseClient {
  if (typeof document === "undefined") {
    return createSupabaseClient();
  }
  if (!browserClient) {
    browserClient = createSupabaseClient();
  }
  return browserClient;
}
