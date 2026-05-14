/** Normaliza texto para o formato aceito em `companies.slug` (migration `companies_slug_format`). */
export function normalizePublicBookingSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidPublicBookingSlug(s: string): boolean {
  return s.length > 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}
