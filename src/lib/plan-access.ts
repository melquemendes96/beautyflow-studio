/**
 * Níveis de recurso por plano (nome do catálogo em `plans.name`).
 * Essencial: base. Studio Pro: marca, lista de espera, relatórios. Elite: + WhatsApp oficial.
 */

export type PlanGatedFeature = "branding" | "waitlist" | "reports" | "whatsapp";

function normalizePlanName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

/** Indica se o nome do plano contratado libera o recurso (assinatura ativa é validada no guard). */
export function planNameAllowsFeature(planName: string | null | undefined, feature: PlanGatedFeature): boolean {
  const n = normalizePlanName(planName);
  if (!n) return false;

  const isElite = n.includes("elite");
  const isPro =
    n.includes("studio pro") || (n.includes("pro") && !n.includes("elite")) || n.includes("stúdio pro");

  if (feature === "whatsapp") {
    return isElite;
  }
  if (feature === "branding" || feature === "waitlist" || feature === "reports") {
    return isPro || isElite;
  }
  return true;
}

export function featureToPortugueseLabel(feature: PlanGatedFeature): string {
  if (feature === "branding") return "personalização de marca";
  if (feature === "waitlist") return "lista de espera";
  if (feature === "reports") return "relatórios";
  return "WhatsApp oficial";
}
