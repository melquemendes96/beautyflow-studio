/**
 * Normaliza slug igual a `normalize_booking_slug` no Postgres:
 * lowercase, sequências não [a-z0-9-] viram hífen, trim de hífens nas pontas.
 */
export function normalizePublicBookingSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidPublicBookingSlug(s: string): boolean {
  return s.length > 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}
