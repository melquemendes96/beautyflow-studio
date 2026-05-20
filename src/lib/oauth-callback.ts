import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";
import { authPerf } from "@/lib/auth-perf";

export function hasOAuthParamsInUrl(href = typeof window !== "undefined" ? window.location.href : ""): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    const hash = url.hash.replace(/^#/, "");
    if (hash.includes("access_token=") || hash.includes("error=") || hash.includes("error_description=")) {
      return true;
    }
    const q = url.searchParams;
    return q.has("code") || q.has("error") || q.has("error_description");
  } catch {
    return false;
  }
}

/** Troca code/hash do Google por sessão Supabase. */
export async function completeOAuthFromUrl(
  href = typeof window !== "undefined" ? window.location.href : "",
): Promise<{ session: Session | null; error: string | null }> {
  if (!href) return { session: null, error: "URL inválida." };

  const supabase = getSupabase();
  authPerf("oauth completeOAuthFromUrl início");

  try {
    const url = new URL(href);
    const code = url.searchParams.get("code");

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        authPerf("oauth exchangeCodeForSession erro", { message: error.message });
        return { session: null, error: error.message };
      }
    } else if (hasOAuthParamsInUrl(href)) {
      const { error } = await supabase.auth.getSession();
      if (error) {
        authPerf("oauth getSession hash erro", { message: error.message });
        return { session: null, error: error.message };
      }
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      return { session: null, error: sessionError.message };
    }

    if (!session?.access_token) {
      return { session: null, error: "Sessão não encontrada após login com Google." };
    }

    authPerf("oauth completeOAuthFromUrl ok", { userId: session.user.id });
    return { session, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao finalizar login.";
    return { session: null, error: msg };
  }
}

export function cleanOAuthUrlFromAddressBar() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname || "/auth/callback";
  window.history.replaceState({}, document.title, path);
}
