import { useAuth } from "@/contexts/AuthProvider";

/**
 * Fase 6: enquanto não existe seletor de empresa no painel,
 * usamos a primeira empresa vinculada ao usuário.
 */
export function useCurrentCompany() {
  const { companyMemberships } = useAuth();
  const primary = companyMemberships[0] ?? null;
  const isProvider = primary?.role === "provider" && Boolean(primary.provider_id);
  return {
    companyId: primary?.company_id ?? null,
    role: primary?.role ?? null,
    providerId: primary?.provider_id ?? null,
    isProvider,
    isOwnerAdmin: primary?.role === "owner" || primary?.role === "admin",
    hasCompany: Boolean(primary?.company_id),
  };
}
