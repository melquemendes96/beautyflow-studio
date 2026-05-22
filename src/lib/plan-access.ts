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

const CORE_FEATURES = new Set<FeatureKey>([
  "agenda",
  "clients",
  "services",
  "public_booking",
  "history",
]);

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

async function resolveCompanyPlanName(companyId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data: sub } = await supabase
    .from("tenant_subscriptions")
    .select("plans(name)")
    .eq("company_id", companyId)
    .maybeSingle();
  const fromSub = (sub?.plans as { name?: string | null } | null)?.name;
  if (fromSub) return fromSub;
  const { data: co } = await supabase.from("companies").select("plans(name)").eq("id", companyId).maybeSingle();
  return (co?.plans as { name?: string | null } | null)?.name ?? null;
}

/**
 * Verifica acesso a recurso via plan_features (RPC) com fallback legado por nome.
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

  if (import.meta.env.DEV && error) {
    console.warn("[hasFeatureAccess] RPC fallback:", error.message);
  }

  const planName = await resolveCompanyPlanName(companyId);
  if (CORE_FEATURES.has(featureKey)) {
    return legacyPlanNameAllowsFeature(planName, featureKey);
  }
  return legacyPlanNameAllowsFeature(planName, featureKey);
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
