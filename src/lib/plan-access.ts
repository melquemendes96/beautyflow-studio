import { getSupabase } from "@/lib/supabaseClient";

/**
 * Chaves do catálogo global (features_catalog).
 * Gates do admin usam subconjunto; demais chaves ficam disponíveis para evolução.
 */
export const FEATURE_KEYS = [
  "agenda",
  "clients",
  "services",
  "public_booking",
  "history",
  "branding",
  "waitlist",
  "reports",
  "whatsapp",
  "automation",
  "finance",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** @deprecated Use FeatureKey — alias para rotas já gateadas */
export type PlanGatedFeature = Extract<FeatureKey, "branding" | "waitlist" | "reports" | "whatsapp">;

function normalizePlanName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

/**
 * Fallback legado por nome do plano (mantido até 100% dos planos terem plan_features).
 */
export function legacyPlanNameAllowsFeature(
  planName: string | null | undefined,
  feature: FeatureKey,
): boolean {
  const n = normalizePlanName(planName);
  if (!n) return false;

  const isElite = n.includes("elite");
  const isPro =
    n.includes("studio pro") || (n.includes("pro") && !isElite) || n.includes("stúdio pro") || n.includes("profissional");

  if (feature === "whatsapp" || feature === "automation" || feature === "finance") {
    return isElite;
  }
  if (feature === "branding" || feature === "waitlist" || feature === "reports") {
    return isPro || isElite;
  }
  return true;
}

/** @deprecated Alias de legacyPlanNameAllowsFeature */
export const planNameAllowsFeature = legacyPlanNameAllowsFeature;

/**
 * Verifica acesso via RPC `company_has_plan_feature` (fallback legado só no SQL se plano sem flags).
 * Se a RPC falhar, nega acesso (fail-closed).
 */
export async function hasFeatureAccess(companyId: string, featureKey: FeatureKey): Promise<boolean> {
  if (!companyId) return false;

  const { data, error } = await getSupabase().rpc("company_has_plan_feature", {
    p_company_id: companyId,
    p_feature_key: featureKey,
  });

  if (!error && typeof data === "boolean") {
    return data;
  }

  if (error && import.meta.env.DEV) {
    console.warn("[hasFeatureAccess] RPC indisponível — acesso negado:", error.message);
  }

  return false;
}

export function featureToPortugueseLabel(feature: FeatureKey | PlanGatedFeature): string {
  const labels: Record<string, string> = {
    agenda: "agenda",
    clients: "clientes",
    services: "serviços",
    public_booking: "página pública de agendamento",
    history: "histórico",
    branding: "personalização de marca",
    waitlist: "lista de espera",
    reports: "relatórios",
    whatsapp: "WhatsApp oficial",
    automation: "automação",
    finance: "financeiro",
  };
  return labels[feature] ?? feature;
}
