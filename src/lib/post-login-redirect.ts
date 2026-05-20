import { resolvePostLoginDestination } from "@/lib/post-login";

export type PostLoginResult =
  | { ok: true; href: "/admin" | "/master/empresas" | "/billing/plans" | "/onboarding/company" }
  | { ok: false; reason: "no_panel_access" | "auth_config" };

/** @deprecated use resolvePostLoginDestination / runPostLoginNavigation */
export async function getPostLoginDestination(planId?: string): Promise<PostLoginResult> {
  const dest = await resolvePostLoginDestination({ planId });
  if (dest.kind === "stay" || dest.kind === "login") {
    return { ok: false, reason: "no_panel_access" };
  }
  return { ok: true, href: dest.path };
}
