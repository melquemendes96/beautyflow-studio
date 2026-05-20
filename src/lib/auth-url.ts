/** URL de retorno OAuth — sempre path limpo, sem hash de rota. */
export function getAuthCallbackUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  const site = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (site) return `${site.replace(/\/+$/, "")}/auth/callback`;
  return "/auth/callback";
}
