/** Dados fictícios — rotas /demo e /demo/barbearia (sem Supabase). */

export type DemoService = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  imageUrl: string;
};

export type DemoProvider = {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
};

export type DemoShowcase = {
  id: "beauty" | "barbearia";
  theme: "cream" | "dark";
  pageBg: string;
  previewBg: string;
  accent: string;
  assets: {
    banner: string;
    logo: string;
    footer: string | null;
  };
  hero: {
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    badges: readonly string[];
  };
  studio: {
    name: string;
    slogan: string;
    instagram: string;
    instagramUrl: string;
    whatsapp: string;
    whatsappUrl: string;
    description: string;
    address: string;
    hours: string;
  };
  services: DemoService[];
  providers?: DemoProvider[];
  slots: readonly string[];
  features: readonly {
    title: string;
    description: string;
    icon: "crown" | "calendar" | "shield" | "sparkles" | "scissors" | "flame";
  }[];
  ctaSignupLabel: string;
};

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

export const DEMO_BARBER_ASSETS = {
  banner: "/demo/barbearia/banner.webp",
  logo: "/demo/barbearia/logo.webp",
  footer: null as string | null,
  serviceCut: "/demo/barbearia/service-cut.webp",
  serviceBeard: "/demo/barbearia/service-beard.webp",
  serviceShave: "/demo/barbearia/service-shave.webp",
  serviceCombo: "/demo/barbearia/service-combo.webp",
  barberRafael: "/demo/barbearia/barber-rafael.webp",
  barberLucas: "/demo/barbearia/barber-lucas.webp",
  barberAndre: "/demo/barbearia/barber-andre.webp",
  barberDiego: "/demo/barbearia/barber-diego.webp",
  barberThiago: "/demo/barbearia/barber-thiago.webp",
} as const;

/** Demo feminina — La Belle (rota /demo). */
export const DEMO_BEAUTY_SHOWCASE: DemoShowcase = {
  id: "beauty",
  theme: "cream",
  pageBg: "#fdf9f4",
  previewBg: "#fdf9f4",
  accent: "#d4af37",
  assets: {
    banner: DEMO_ASSETS.banner,
    logo: DEMO_ASSETS.logo,
    footer: DEMO_ASSETS.footer,
  },
  hero: {
    titleLine1: "Sua beleza,",
    titleLine2: "nossa paixão! ✨",
    subtitle: "Agende seu horário de forma rápida,\nfácil e segura.",
    badges: ["Rápido", "Seguro", "Profissional"],
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
  slots: ["09:00", "09:30", "10:00", "11:00", "14:00", "15:30", "16:00", "17:00"],
  features: [
    {
      title: "Profissionais Qualificados",
      description: "Especialistas prontas para realçar sua beleza",
      icon: "crown",
    },
    {
      title: "Agendamento Online 24h",
      description: "Agende quando e onde quiser, sem complicação",
      icon: "calendar",
    },
    {
      title: "Segurança e Privacidade",
      description: "Seus dados protegidos com tecnologia de ponta",
      icon: "shield",
    },
    {
      title: "Experiência Premium",
      description: "Ambiente acolhedor e serviços de alta qualidade",
      icon: "sparkles",
    },
  ],
  ctaSignupLabel: "Criar minha página de agendamento",
};

/** Demo masculina — Barbearia Corte & Barba (rota /demo/barbearia). */
export const DEMO_BARBER_SHOWCASE: DemoShowcase = {
  id: "barbearia",
  theme: "dark",
  // Fora do celular: branco, para contrastar com a tela escura
  pageBg: "#ffffff",
  previewBg: "#111111",
  accent: "#c9a227",
  assets: {
    banner: DEMO_BARBER_ASSETS.banner,
    logo: DEMO_BARBER_ASSETS.logo,
    footer: DEMO_BARBER_ASSETS.footer,
  },
  hero: {
    titleLine1: "Estilo e precisão,",
    titleLine2: "na navalha certa.",
    subtitle: "Agende corte, barba e combo\nsem fila e sem ligação.",
    badges: ["Na hora", "Sem fila", "Profissional"],
  },
  studio: {
    name: "Barbearia Corte & Barba",
    slogan: "Corte masculino com atitude",
    instagram: "@corteebarba.demo",
    instagramUrl: "https://instagram.com/corteebarba.demo",
    whatsapp: "(11) 91234-5678",
    whatsappUrl: "https://wa.me/5511912345678",
    description:
      "Bem-vindo à Barbearia Corte & Barba. Degradê afiado, barba alinhada e atendimento no horário.",
    address: "Av. Paulista, 1000 - Bela Vista, São Paulo - SP",
    hours: "Seg à Sáb - 09h às 20h",
  },
  services: [
    {
      id: "cut",
      name: "Corte degradê",
      duration_minutes: 40,
      price: 65,
      imageUrl: DEMO_BARBER_ASSETS.serviceCut,
    },
    {
      id: "beard",
      name: "Barba completa",
      duration_minutes: 30,
      price: 45,
      imageUrl: DEMO_BARBER_ASSETS.serviceBeard,
    },
    {
      id: "combo",
      name: "Combo corte + barba",
      duration_minutes: 70,
      price: 95,
      imageUrl: DEMO_BARBER_ASSETS.serviceCombo,
    },
    {
      id: "shave",
      name: "Toalha quente + navalha",
      duration_minutes: 35,
      price: 55,
      imageUrl: DEMO_BARBER_ASSETS.serviceShave,
    },
  ],
  providers: [
    {
      id: "rafael",
      name: "Rafael Costa",
      role: "Master Barber · Fade",
      imageUrl: DEMO_BARBER_ASSETS.barberRafael,
    },
    {
      id: "lucas",
      name: "Lucas Mendes",
      role: "Especialista em degradê",
      imageUrl: DEMO_BARBER_ASSETS.barberLucas,
    },
    {
      id: "andre",
      name: "André Silva",
      role: "Barba & navalha",
      imageUrl: DEMO_BARBER_ASSETS.barberAndre,
    },
    {
      id: "diego",
      name: "Diego Alves",
      role: "Corte contemporâneo",
      imageUrl: DEMO_BARBER_ASSETS.barberDiego,
    },
    {
      id: "thiago",
      name: "Thiago Rocha",
      role: "Skin fade & design",
      imageUrl: DEMO_BARBER_ASSETS.barberThiago,
    },
  ],
  slots: ["09:00", "09:40", "10:20", "11:00", "14:00", "15:20", "16:40", "18:00"],
  features: [
    {
      title: "Barbeiros experientes",
      description: "Fade, navalha e acabamento de alto nível",
      icon: "scissors",
    },
    {
      title: "Agenda online 24h",
      description: "Cliente marca sozinho — você só atende",
      icon: "calendar",
    },
    {
      title: "Menos faltas",
      description: "Lembretes e confirmação pelo WhatsApp",
      icon: "shield",
    },
    {
      title: "Visual de respeito",
      description: "Página com a cara da sua barbearia",
      icon: "flame",
    },
  ],
  ctaSignupLabel: "Criar agenda da minha barbearia",
};

/** Alias legado — demo feminina padrão. */
export const DEMO_SHOWCASE = DEMO_BEAUTY_SHOWCASE;

export type DemoBookingStep = "servico" | "profissional" | "data" | "horario" | "dados" | "confirmado";

export function getDemoBookingSteps(demo: DemoShowcase): DemoBookingStep[] {
  const hasProviders = Boolean(demo.providers && demo.providers.length > 0);
  return hasProviders
    ? ["servico", "profissional", "data", "horario", "dados"]
    : ["servico", "data", "horario", "dados"];
}

/** @deprecated use getDemoBookingSteps(demo) */
export const DEMO_BOOKING_STEPS: DemoBookingStep[] = ["servico", "data", "horario", "dados"];

/** Assets realmente visíveis na abertura da demo. */
export function collectDemoAboveFoldAssetUrls(demo: DemoShowcase): string[] {
  const urls = [
    demo.assets.banner,
    demo.assets.logo,
  ];
  return [...new Set(urls.filter(Boolean))];
}

export function formatDemoPrice(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
