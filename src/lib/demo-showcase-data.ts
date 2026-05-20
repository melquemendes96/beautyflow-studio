/** Dados fictícios — apenas rota /demo (sem Supabase). */

export const DEMO_ASSETS = {
  banner: "/demo/banner.png",
  logo: "/demo/logo.png",
  logoHd: "/demo/logo-hd.png",
  footer: "/demo/footer.png",
  serviceBrows: "/demo/service-brows.jpg?v=3",
  serviceNails: "/demo/service-nails.jpg?v=3",
  serviceHair: "/demo/service-hair.jpg?v=3",
  serviceLashes: "/demo/service-lashes.jpg?v=3",
} as const;

export const DEMO_SHOWCASE = {
  hero: {
    titleLine1: "Sua beleza,",
    titleLine2: "nossa paixão! ✨",
    subtitle: "Agende seu horário de forma rápida,\nfácil e segura.",
    badges: ["Rápido", "Seguro", "Profissional"] as const,
  },
  studio: {
    name: "La Belle Beauty Studio",
    slogan: "Realce sua melhor versão todos os dias",
    instagram: "@labelle.studio",
    instagramUrl: "https://instagram.com/labelle.studio",
    whatsapp: "(11) 98765-4321",
    whatsappUrl: "https://wa.me/5511987654321",
    description:
      "Seja bem-vinda ao La Belle Beauty Studio ✨ Aqui cuidamos de você com carinho e excelência.",
    address: "Rua das Flores, 123 - Jardins, São Paulo - SP",
    hours: "Seg à Sáb - 09h às 19h",
  },
  services: [
    {
      id: "brows",
      name: "Design de Sobrancelhas",
      duration_minutes: 30,
      price: 45,
      imageUrl: DEMO_ASSETS.serviceBrows,
    },
    {
      id: "nails",
      name: "Manicure",
      duration_minutes: 45,
      price: 35,
      imageUrl: DEMO_ASSETS.serviceNails,
    },
    {
      id: "hair",
      name: "Hidratação Capilar",
      duration_minutes: 60,
      price: 120,
      imageUrl: DEMO_ASSETS.serviceHair,
    },
    {
      id: "lashes",
      name: "Extensão de Cílios",
      duration_minutes: 90,
      price: 180,
      imageUrl: DEMO_ASSETS.serviceLashes,
    },
  ],
  slots: ["09:00", "09:30", "10:00", "11:00", "14:00", "15:30", "16:00", "17:00"] as const,
  features: [
    {
      title: "Profissionais Qualificados",
      description: "Especialistas prontas para realçar sua beleza",
      icon: "crown" as const,
    },
    {
      title: "Agendamento Online 24h",
      description: "Agende quando e onde quiser, sem complicação",
      icon: "calendar" as const,
    },
    {
      title: "Segurança e Privacidade",
      description: "Seus dados protegidos com tecnologia de ponta",
      icon: "shield" as const,
    },
    {
      title: "Experiência Premium",
      description: "Ambiente acolhedor e serviços de alta qualidade",
      icon: "sparkles" as const,
    },
  ],
} as const;

export type DemoBookingStep = "servico" | "data" | "horario" | "dados" | "confirmado";

export const DEMO_BOOKING_STEPS: DemoBookingStep[] = ["servico", "data", "horario", "dados"];

export function formatDemoPrice(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
