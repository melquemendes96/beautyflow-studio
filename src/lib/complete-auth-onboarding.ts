import { authService } from "@/services/authService";
import { isMasterAccount, loadAuthProfile } from "@/lib/auth-profile";
import {
  navigateToAuthDestination,
  resolveAuthDestination,
  type NavigateFn,
} from "@/lib/auth-routing";
import { profileService } from "@/services/profileService";

export type AuthOnboardingResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "needs_company_name" | "bootstrap_failed" | "no_panel_access" | "auth_config";
    };

export async function navigateAfterAuthenticatedSession(opts: {
  navigate: NavigateFn;
  planId?: string;
  companyName?: string | null;
  refreshAuth?: () => Promise<void>;
  preferTrial?: boolean;
}): Promise<AuthOnboardingResult> {
  const profile = await loadAuthProfile({ waitForSession: true });

  if (profile.authConfigError) {
    return { ok: false, code: "auth_config", error: profile.authConfigError };
  }

  if (!profile.session) {
    return {
      ok: false,
      code: "bootstrap_failed",
      error: "Sessão não encontrada. Faça login novamente.",
    };
  }

  await profileService.ensureProfile().catch(() => undefined);

  if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
    await opts.refreshAuth?.();
    await navigateToAuthDestination(opts.navigate, { kind: "master", path: "/master" });
    return { ok: true };
  }

  const dest = await resolveAuthDestination({
    planId: opts.planId,
    preferTrial: opts.preferTrial,
  });

  if (dest.kind === "onboarding_company" && opts.companyName?.trim()) {
    const { onboardingService } = await import("@/services/onboardingService");
    const boot = await onboardingService.bootstrapCompany({ companyName: opts.companyName.trim() });
    const data = boot.data as { ok?: boolean; error?: string } | null;
    if (boot.error || data?.ok === false) {
      if (data?.error === "company_name_required" || data?.error === "invalid_company_name") {
        return {
          ok: false,
          code: "needs_company_name",
          error: "Informe o nome do seu negócio para continuar.",
        };
      }
      return {
        ok: false,
        code: "bootstrap_failed",
        error: "Não foi possível criar seu studio. Tente novamente.",
      };
    }
    await authService.updateCompanyNameMetadata(opts.companyName.trim());
    await opts.refreshAuth?.();
    const dest2 = await resolveAuthDestination({ planId: opts.planId, preferTrial: opts.preferTrial });
    await navigateToAuthDestination(opts.navigate, dest2);
    return { ok: true };
  }

  if (dest.kind === "stay") {
    if (isMasterAccount(profile.session) || profile.isPlatformAdmin) {
      await opts.refreshAuth?.();
      await navigateToAuthDestination(opts.navigate, { kind: "master", path: "/master" });
      return { ok: true };
    }
    if (profile.companyMemberships.length === 0) {
      return {
        ok: false,
        code: "no_panel_access",
        error:
          "Configure sua empresa para continuar. Se é sua primeira vez, use Criar conta e informe o nome do negócio.",
      };
    }
  }

  await opts.refreshAuth?.();
  await navigateToAuthDestination(opts.navigate, dest);
  return { ok: true };
}
