import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";

export function hasPasswordRecoveryParamsInUrl(
  href = typeof window !== "undefined" ? window.location.href : "",
): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    const hash = url.hash.replace(/^#/, "");
    if (hash.includes("type=recovery") || hash.includes("access_token=")) return true;
    return url.searchParams.get("type") === "recovery";
  } catch {
    return false;
  }
}

/** Converte link do e-mail (hash PKCE) em sessão de recuperação. */
export async function completePasswordRecoveryFromUrl(
  href = typeof window !== "undefined" ? window.location.href : "",
): Promise<{ session: Session | null; error: string | null }> {
  if (!href) return { session: null, error: "Link inválido." };

  const supabase = getSupabase();

  try {
    const url = new URL(href);
    const hash = url.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type") ?? url.searchParams.get("type");

    if (type === "recovery" && accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return { session: null, error: error.message };
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) return { session: null, error: sessionError.message };
    if (!session?.access_token) {
      return { session: null, error: "Link expirado ou inválido. Solicite um novo e-mail de recuperação." };
    }

    return { session, error: null };
  } catch (e) {
    return { session: null, error: e instanceof Error ? e.message : "Não foi possível validar o link." };
  }
}

export function cleanPasswordRecoveryUrlFromAddressBar() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, document.title, window.location.pathname || "/reset-password");
}
