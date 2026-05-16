import type { Session } from "@supabase/supabase-js";
import { getSupabase, getSupabaseKeyConfigurationError, isSupabaseConfigured } from "@/lib/supabaseClient";

const AUTH_BOOT_TIMEOUT_MS = 5000;

/** Leitura rápida de sessão — uma chamada, sem polling. */
export async function readSessionQuick(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) {
      if (import.meta.env.DEV) console.warn("[auth] getSession:", error.message);
      return null;
    }
    return data.session?.access_token && data.session.user ? data.session : null;
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[auth] getSession failed", e);
    return null;
  }
}

export function getAuthConfigError(): string | null {
  return getSupabaseKeyConfigurationError();
}

export function withAuthTimeout<T>(promise: Promise<T>, ms = AUTH_BOOT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth_timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}
