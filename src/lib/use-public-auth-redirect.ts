import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthProvider";
import { resolveAuthDestination, navigateToAuthDestination } from "@/lib/auth-routing";

/**
 * Se já autenticado, redireciona do /login ou /cadastro — só após auth carregar em background.
 */
export function usePublicAuthRedirect(planId?: string) {
  const navigate = useNavigate();
  const { session, isLoading, isPlatformAdmin, companyMemberships } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (isLoading || !session) return;
    if (handledRef.current) return;
    handledRef.current = true;

    void (async () => {
      const dest = await resolveAuthDestination({ planId });
      await navigateToAuthDestination(navigate, dest);
    })();
  }, [isLoading, session, isPlatformAdmin, companyMemberships.length, planId, navigate]);
}
