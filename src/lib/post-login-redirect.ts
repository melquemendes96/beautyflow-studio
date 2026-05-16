import { resolveAuthDestination } from "@/lib/auth-routing";

export type PostLoginResult =
  | { ok: true; href: "/dashboard" | "/master" | "/billing/plans" | "/onboarding/company" }
  | { ok: false; reason: "no_panel_access" | "auth_config" };

/** Destino após login — delega para auth-routing (fonte única). */
export async function getPostLoginDestination(planId?: string): Promise<PostLoginResult> {
  const dest = await resolveAuthDestination({ planId });
  if (dest.kind === "stay") {
    return { ok: false, reason: "no_panel_access" };
  }
  if (dest.kind === "login") {
    return { ok: false, reason: "no_panel_access" };
  }
  return { ok: true, href: dest.path };
}
