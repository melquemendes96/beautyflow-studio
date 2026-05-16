/** Dados estáticos da página /demo — não depende de empresa real no Supabase. */
export const DEMO_BOOKING = {
  company: { id: "demo", name: "Studio Demonstração", slug: "demo" },
  branding: {
    brand_name: "Studio Demonstração",
    slogan: "Veja como suas clientes agendam online",
    welcome_text: "Bem-vinda à demonstração do JM BeautyFlow",
    primary_color: "#1a1a1a",
    secondary_color: "#c9a960",
    public_hours_text: "Seg–Sáb · 09h às 19h",
    instagram_url: "@jmbeautyflow",
    address: "Agenda online personalizada",
  },
  services: [
    { id: "d1", name: "Design de sobrancelha", price: 45, duration_minutes: 30, image_url: null },
    { id: "d2", name: "Manicure", price: 35, duration_minutes: 45, image_url: null },
    { id: "d3", name: "Hidratação capilar", price: 120, duration_minutes: 60, image_url: null },
  ],
  slots: ["09:00", "09:30", "10:00", "11:00", "14:00", "15:30", "16:00", "17:00"],
} as const;
