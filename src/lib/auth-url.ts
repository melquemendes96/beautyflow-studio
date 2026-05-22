function siteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const site = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (site) return site.replace(/\/+$/, "");
  return "";
}

/** URL de retorno OAuth — sempre path limpo, sem hash de rota. */
export function getAuthCallbackUrl(): string {
  const origin = siteOrigin();
  return origin ? `${origin}/auth/callback` : "/auth/callback";
}

/** URL de retorno após clicar no e-mail de recuperação de senha. */
export function getPasswordResetRedirectUrl(): string {
  const origin = siteOrigin();
  return origin ? `${origin}/reset-password` : "/reset-password";
}
