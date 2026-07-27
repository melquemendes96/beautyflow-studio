/** Rota da demonstração interativa (não depende de empresa no Supabase). */
export const DEMO_BOOKING_PATH = "/demo" as const;
export const DEMO_BARBER_PATH = "/demo/barbearia" as const;

/** WhatsApp corporativo JM BeautyFlow (comercial / dúvidas de planos). */
export const CORPORATE_WHATSAPP_DIGITS = "5511920142382" as const;
export const CORPORATE_WHATSAPP_MESSAGE =
  "Olá! Vim pelo site do JM BeautyFlow e gostaria de tirar dúvidas sobre os planos." as const;

export function corporateWhatsAppHref(message = CORPORATE_WHATSAPP_MESSAGE): string {
  return `https://wa.me/${CORPORATE_WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
}
