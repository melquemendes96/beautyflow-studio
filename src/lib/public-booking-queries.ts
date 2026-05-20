/** Chaves e tempos de cache para página pública /agendar/:slug */
export const publicBookingKeys = {
  page: (slug: string) => ["public", "booking_page", slug] as const,
  slots: (slug: string, serviceId: string, date: string) =>
    ["public", "available_slots", slug, serviceId, date] as const,
};

export const PUBLIC_BOOKING_STALE_MS = 2 * 60_000;
export const PUBLIC_SLOTS_STALE_MS = 45_000;
