import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthProvider";
import { isMasterAccount } from "@/lib/auth-profile";
import { resolveAuthDestination, navigateToAuthDestination } from "@/lib/auth-routing";

/**
 * Se já autenticado com perfil carregado, redireciona (login/cadastro).
 * Não roda enquanto profileReady=false — evita redirect com sessão incompleta.
 */
export function usePublicAuthRedirect(planId?: string) {
  const navigate = useNavigate();
  const { session, profileReady, isPlatformAdmin, companyMemberships } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!profileReady || !session) return;
    if (handledRef.current) return;
    handledRef.current = true;

    void (async () => {
      if (isMasterAccount(session) || isPlatformAdmin) {
        await navigateToAuthDestination(navigate, { kind: "master", path: "/master" });
        return;
      }
      const dest = await resolveAuthDestination({ planId });
      await navigateToAuthDestination(navigate, dest);
    })();
  }, [profileReady, session, isPlatformAdmin, companyMemberships.length, planId, navigate]);
}
