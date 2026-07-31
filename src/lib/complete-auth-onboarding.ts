import type { NavigateFn } from "@/lib/auth-routing";
import { runPostLoginNavigation } from "@/lib/post-login";

export type AuthOnboardingResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "needs_company_name" | "bootstrap_failed" | "no_panel_access" | "auth_config" | "timeout";
    };

export async function navigateAfterAuthenticatedSession(opts: {
  navigate: NavigateFn;
  planId?: string;
  companyName?: string | null;
  refreshAuth?: () => Promise<void>;
  preferTrial?: boolean;
  skipCheckout?: boolean;
  trialDays?: number | null;
  leadId?: string | null;
}): Promise<AuthOnboardingResult> {
  const res = await runPostLoginNavigation(opts);
  if (res.ok) return { ok: true };
  return {
    ok: false,
    error: res.error,
    code:
      res.code === "needs_company_name"
        ? "needs_company_name"
        : res.code === "timeout"
          ? "timeout"
          : "bootstrap_failed",
  };
}
