import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase — apenas chave anon JWT (eyJ...). Nunca service_role no front.
 * PostgREST rejeita sb_publishable_* com sessão do usuário (401).
 */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();

function resolveSupabaseAnonKey(): string {
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
  const publishable =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

  if (anon.startsWith("eyJ")) return anon;
  if (publishable.startsWith("eyJ")) return publishable;
  return "";
}

const supabaseAnonKey = resolveSupabaseAnonKey();

export const supabaseProjectId: string =
  (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "";

let browserClient: SupabaseClient | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && supabaseAnonKey.startsWith("eyJ"));
}

export function getSupabaseKeyConfigurationError(): string | null {
  if (!url) {
    return "Defina VITE_SUPABASE_URL no .env.";
  }
  if (!supabaseAnonKey.startsWith("eyJ")) {
    return (
      "VITE_SUPABASE_ANON_KEY ausente ou inválida. Use o JWT anon (eyJ...) em Supabase → Settings → API → Legacy → anon. " +
      "Não use sb_publishable_ no lugar do anon — isso causa erro 401 no login."
    );
  }
  return null;
}

export function getSupabaseProjectRef(): string | null {
  if (!url) return null;
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

function createSupabaseClient(): SupabaseClient {
  const configError = getSupabaseKeyConfigurationError();
  if (!url || !supabaseAnonKey.startsWith("eyJ")) {
    throw new Error(configError ?? "Supabase não configurado.");
  }

  const isBrowser = typeof document !== "undefined";
  const projectRef = getSupabaseProjectRef() ?? "default";

  return createClient(url, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: false,
      storageKey: `bf-${projectRef}-auth`,
    },
  });
}

export function getSupabase(): SupabaseClient {
  if (typeof document === "undefined") {
    return createSupabaseClient();
  }
  if (!browserClient) {
    browserClient = createSupabaseClient();
  }
  return browserClient;
}
