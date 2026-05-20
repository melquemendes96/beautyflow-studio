import { useEffect } from "react";
import { hasOAuthParamsInUrl } from "@/lib/oauth-callback";

/**
 * Se o Supabase redirecionar para / ou /login com tokens no hash/query,
 * envia para /auth/callback antes do router perder o fragmento.
 */
export function OAuthUrlRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/auth/callback") return;
    if (!hasOAuthParamsInUrl(window.location.href)) return;

    const target = `/auth/callback${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }, []);

  return null;
}
