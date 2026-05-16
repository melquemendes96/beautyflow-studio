import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthProvider";
import { navigateToAuthDestination, resolveAuthDestinationFromProfile } from "@/lib/auth-routing";

/**
 * Após OAuth ou sessão restaurada no browser, aplica roteamento inteligente.
 */
export function useAuthenticatedPanelRedirect(planId?: string) {
  const navigate = useNavigate();
  const { session, isLoading, isPlatformAdmin, companyMemberships, authConfigError } = useAuth();

  useEffect(() => {
    if (isLoading || !session || authConfigError) return;

    const dest = resolveAuthDestinationFromProfile(
      {
        session,
        user: session.user,
        isPlatformAdmin,
        companyMemberships,
        authConfigError: null,
      },
      { planId },
    );

    void navigateToAuthDestination(navigate, dest);
  }, [isLoading, session, isPlatformAdmin, companyMemberships.length, planId, navigate, authConfigError]);
}
