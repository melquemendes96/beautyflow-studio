import { loadAuthProfile } from "@/lib/auth-profile";

export type PostLoginResult =
  | { ok: true; href: "/admin" | "/master" }
  | { ok: false; reason: "no_panel_access" };

/** Destino após login: painel da empresa ou master, conforme vínculos no banco. */
export async function getPostLoginDestination(): Promise<PostLoginResult> {
  const profile = await loadAuthProfile();
  if (profile.authConfigError) {
    return { ok: false, reason: "no_panel_access" };
  }
  if (!profile.session) {
    return { ok: false, reason: "no_panel_access" };
  }
  if (profile.isPlatformAdmin) {
    return { ok: true, href: "/master" };
  }
  if (profile.companyMemberships.length > 0) {
    return { ok: true, href: "/admin" };
  }
  return { ok: false, reason: "no_panel_access" };
}
