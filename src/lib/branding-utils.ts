/** Dados de marca da empresa (tabela branding_settings + fallback companies). */
export type CompanyBranding = {
  brand_name?: string | null;
  slogan?: string | null;
  welcome_text?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  instagram_url?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  public_hours_text?: string | null;
  banner_image_pos_x?: number | null;
  banner_image_pos_y?: number | null;
  logo_image_pos_x?: number | null;
  logo_image_pos_y?: number | null;
};

export type CompanySummary = {
  name?: string | null;
};

export function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

export function displayStudioName(
  company: CompanySummary | null | undefined,
  branding: CompanyBranding | null | undefined,
): string {
  const brand = branding?.brand_name?.trim();
  if (brand) return brand;
  return company?.name?.trim() || "Studio";
}

export function studioInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ST";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
}

export function formatInstagramHref(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const handle = t.replace(/^@/, "");
  if (!handle) return null;
  return `https://instagram.com/${handle}`;
}

export function formatInstagramLabel(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "Instagram";
  return t.startsWith("@") ? t : `@${t.replace(/^@/, "").split("/").pop() ?? t}`;
}

export function formatWhatsAppHref(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

export function formatWhatsAppLabel(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "WhatsApp";
  if (digits.length >= 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return raw?.trim() || "WhatsApp";
}
