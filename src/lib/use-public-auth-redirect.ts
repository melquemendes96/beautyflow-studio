import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthProvider";
import { runPostLoginNavigation } from "@/lib/post-login";

const SKIP_REDIRECT_PREFIXES = ["/onboarding", "/auth/callback", "/admin", "/master", "/billing"];

function shouldSkipPublicRedirect(pathname: string): boolean {
  return SKIP_REDIRECT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Redireciona usuário já logado que abre /login ou /cadastro.
 * Não roda em onboarding/admin/master (evita loop).
 */
export function usePublicAuthRedirect(planId?: string, opts?: { skip?: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session, profileReady, authConfigError, isPlatformAdmin, refresh } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (opts?.skip || isPlatformAdmin) return;
    if (shouldSkipPublicRedirect(pathname)) return;
    if (!profileReady || !session || authConfigError) return;
    if (handledRef.current) return;
    handledRef.current = true;

    void runPostLoginNavigation({
      navigate,
      planId,
      refreshAuth: () => refresh({ silent: true, full: true }),
    }).then((res) => {
      if (!res.ok && import.meta.env.DEV) {
        console.warn("[usePublicAuthRedirect]", res.error);
      }
    });
  }, [pathname, profileReady, session, authConfigError, isPlatformAdmin, planId, navigate, refresh, opts?.skip]);
}
