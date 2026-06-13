/**
 * Rótulos canônicos de recursos (features_catalog.name + bullets legados em plans.features).
 * Corrige strings com "??" quando o banco foi gravado com encoding incorreto.
 */
const EXACT_CORRUPTED_LABEL: Record<string, string> = {
  "hist??rico": "Histórico",
  "p??gina p??blica": "Página pública",
  "servi??os": "Serviços",
  "hist??rico de atendimentos": "Histórico de atendimentos",
  "p??gina p??blica de agendamento": "Página pública de agendamento",
  "apar??ncia da marca": "Aparência da marca",
  "relat??rios": "Relatórios",
  "automa??o": "Automação",
};

/** Chaves após remover "??" (perde vogal do acento — ex.: Histórico → histrico). */
const CANONICAL_BY_NORMALIZED_KEY: Record<string, string> = {
  agenda: "Agenda",
  clientes: "Clientes",
  servicos: "Serviços",
  servios: "Serviços",
  "pagina publica": "Página pública",
  "pgina pblica": "Página pública",
  "pagina publica de agendamento": "Página pública de agendamento",
  "pgina pblica de agendamento": "Página pública de agendamento",
  historico: "Histórico",
  histrico: "Histórico",
  "historico de atendimentos": "Histórico de atendimentos",
  "histrico de atendimentos": "Histórico de atendimentos",
  "aparencia da marca": "Aparência da marca",
  "lista de espera": "Lista de espera",
  relatorios: "Relatórios",
  whatsapp: "WhatsApp",
  automacao: "Automação",
  financeiro: "Gestão Financeira",
  "gestao financeira": "Gestão Financeira",
  "agenda online": "Agenda online",
  "cadastro de servicos": "Cadastro de serviços",
  "cadastro de clientes": "Cadastro de clientes",
  "painel administrativo basico": "Painel administrativo básico",
  "personalizacao de marca logo e cores": "Personalização de marca, logo e cores",
  "area exclusiva do cliente": "Área exclusiva do cliente",
  "lembretes automaticos": "Lembretes automáticos",
  "dashboard avancado": "Dashboard avançado",
  "suporte prioritario": "Suporte prioritário",
};

/** Remove acentos e "??" para comparar com o mapa canônico. */
function normalizeFeatureLabelKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\?\?/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Corrige rótulo de feature exibido nos cards de plano.
 * Se não houver correspondência, remove sequências "??" restantes.
 */
export function fixPlanFeatureLabel(label: string): string {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return trimmed;
  if (!trimmed.includes("??")) return trimmed;

  const exact = EXACT_CORRUPTED_LABEL[trimmed.toLowerCase()];
  if (exact) return exact;

  const key = normalizeFeatureLabelKey(trimmed);
  const canonical = CANONICAL_BY_NORMALIZED_KEY[key];
  if (canonical) return canonical;

  return trimmed.replace(/\?\?/g, "");
}

export function fixPlanFeatureLabels(features: string[] | null | undefined): string[] {
  if (!Array.isArray(features)) return [];
  return features.map(fixPlanFeatureLabel);
}

export function sanitizePlanRow<T extends { features?: string[] | null }>(plan: T): T {
  if (!plan || !Array.isArray(plan.features)) return plan;
  return { ...plan, features: fixPlanFeatureLabels(plan.features) };
}

export function sanitizePlanList<T extends { features?: string[] | null }>(
  plans: T[] | null | undefined,
): T[] {
  if (!Array.isArray(plans)) return [];
  return plans.map(sanitizePlanRow);
}
