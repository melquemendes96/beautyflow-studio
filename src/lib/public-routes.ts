/** Rotas que não devem bloquear na validação global de sessão. */
const PUBLIC_PATH_PREFIXES = [
  "/",
  "/login",
  "/register",
  "/cadastro",
  "/entrar",
  "/plans",
  "/planos",
  "/demo",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/cliente",
] as const;

const PUBLIC_BOOKING_PREFIX = "/agendar/";

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return p;
}

export function isPublicAuthPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  if (p === "/") return true;
  if (p.startsWith(PUBLIC_BOOKING_PREFIX)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => prefix !== "/" && (p === prefix || p.startsWith(`${prefix}/`)));
}
