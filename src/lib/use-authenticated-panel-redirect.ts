import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthProvider";

/**
 * Após OAuth ou sessão restaurada no browser, envia master → /master e tenant → /admin.
 * Necessário porque beforeLoad no SSR não vê sessão (localStorage + hash do Supabase).
 */
export function useAuthenticatedPanelRedirect(planId?: string) {
  const navigate = useNavigate();
  const { session, isLoading, isPlatformAdmin, companyMemberships } = useAuth();

  useEffect(() => {
    if (isLoading || !session) return;

    if (isPlatformAdmin) {
      void navigate({ to: "/master", replace: true });
      return;
    }

    if (companyMemberships.length > 0) {
      if (planId) {
        void navigate({
          to: "/admin/plano/checkout",
          search: { planId, trial: false },
          replace: true,
        });
      } else {
        void navigate({ to: "/admin", replace: true });
      }
    }
  }, [isLoading, session, isPlatformAdmin, companyMemberships.length, planId, navigate]);
}
