import { useAuth } from "@/contexts/AuthProvider";

/**
 * Fase 6: enquanto não existe seletor de empresa no painel,
 * usamos a primeira empresa vinculada ao usuário.
 */
export function useCurrentCompany() {
  const { companyMemberships } = useAuth();
  const primary = companyMemberships[0] ?? null;
  return {
    companyId: primary?.company_id ?? null,
    role: primary?.role ?? null,
    hasCompany: Boolean(primary?.company_id),
  };
}

