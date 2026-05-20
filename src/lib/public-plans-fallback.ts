/** Planos estáticos quando Supabase está indisponível ou sem catálogo ativo. */
export type PublicPlanFallback = {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
};

export const PUBLIC_PLANS_FALLBACK: PublicPlanFallback[] = [
  {
    id: "fallback-starter",
    name: "Starter",
    price: 49,
    description: "Comece a digitalizar sua agenda hoje mesmo.",
    features: [
      "Agenda online",
      "Cadastro de serviços",
      "Cadastro de clientes",
      "Página pública de agendamento",
      "Painel administrativo básico",
    ],
  },
  {
    id: "fallback-profissional",
    name: "Profissional",
    price: 79,
    description: "O plano ideal para studios que querem crescer.",
    features: [
      "Tudo do Starter",
      "Personalização de marca, logo e cores",
      "Lista de espera",
      "Relatórios completos",
      "Área exclusiva do cliente",
    ],
  },
  {
    id: "fallback-premium",
    name: "Premium",
    price: 119,
    description: "Automação premium para alta performance.",
    features: [
      "Tudo do Profissional",
      "WhatsApp integrado",
      "Lembretes automáticos",
      "Dashboard avançado",
      "Suporte prioritário",
    ],
  },
];
