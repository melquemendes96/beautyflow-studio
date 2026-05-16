import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para o browser e para SSR (TanStack Start).
 * Usa apenas chave pública (anon JWT eyJ...); nunca service_role no front.
 *
 * IMPORTANTE: PostgREST (/rest/v1) exige a chave **anon legacy** (JWT eyJ...).
 * A chave nova `sb_publishable_*` sozinha costuma gerar 401 nas queries autenticadas.
 */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();

function resolveSupabaseAnonKey(): string {
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
  const publishable =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

  if (anon.startsWith("eyJ")) return anon;
  if (publishable.startsWith("eyJ")) return publishable;
  if (publishable.startsWith("sb_publishable_")) return publishable;
  return anon || publishable;
}

const supabaseAnonKey = resolveSupabaseAnonKey();

export const supabaseProjectId: string =
  (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "";

let browserClient: SupabaseClient | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && supabaseAnonKey);
}

/**
 * Erro de configuração visível no login quando só existe sb_publishable_ (401 em REST).
 */
export function getSupabaseKeyConfigurationError(): string | null {
  if (!url || !supabaseAnonKey) {
    return "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (JWT eyJ...) no .env e rode npm run build.";
  }
  if (supabaseAnonKey.startsWith("sb_publishable_")) {
    const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
    if (!anon.startsWith("eyJ")) {
      return (
        "Chave Supabase incorreta para o painel: use VITE_SUPABASE_ANON_KEY com o JWT anon (começa com eyJ...) " +
        "em Supabase → Settings → API → Legacy API Keys → anon. A chave sb_publishable_ sozinha causa erro 401."
      );
    }
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
  if (!url || !supabaseAnonKey) {
    throw new Error(
      "Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (JWT eyJ...) no .env. Reinicie o dev server após salvar.",
    );
  }
  if (configError && import.meta.env.DEV) {
    console.error("[supabase]", configError);
  }

  const isBrowser = typeof document !== "undefined";
  const projectRef = getSupabaseProjectRef() ?? "default";

  return createClient(url, supabaseAnonKey, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
      storageKey: `bf-${projectRef}-auth`,
    },
    global: {
      headers: {
        "X-Client-Info": "beautyflow-studio",
      },
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
