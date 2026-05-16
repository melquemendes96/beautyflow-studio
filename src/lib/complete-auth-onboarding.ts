import { authService } from "@/services/authService";
import { getPostLoginDestination } from "@/lib/post-login-redirect";
import { resolveCompanyNameForBootstrap } from "@/lib/resolve-company-name";
import { readStudioNameFromUrl } from "@/lib/oauth-signup-intent";
import { onboardingService } from "@/services/onboardingService";

type NavigateFn = (opts: {
  to: string;
  search?: Record<string, unknown>;
  replace?: boolean;
}) => Promise<void>;

export type AuthOnboardingResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "needs_company_name" | "bootstrap_failed" | "no_panel_access";
    };

export async function navigateAfterAuthenticatedSession(opts: {
  navigate: NavigateFn;
  planId?: string;
  companyName?: string | null;
  refreshAuth?: () => Promise<void>;
}): Promise<AuthOnboardingResult> {
  const dest = await getPostLoginDestination();
  if (!dest.ok) {
    const companyName =
      (await resolveCompanyNameForBootstrap(opts.companyName)) ??
      readStudioNameFromUrl();

    if (!companyName) {
      return {
        ok: false,
        code: "no_panel_access",
        error:
          "Nenhum studio está vinculado a esta conta. Se é sua primeira vez, crie uma conta e informe o nome do seu negócio. Se já se cadastrou, use o mesmo e-mail ou entre com senha.",
      };
    }

    const boot = await onboardingService.bootstrapCompany({ companyName });
    const data = boot.data as { ok?: boolean; error?: string; slug?: string; detail?: string } | null;
    if (boot.error || data?.ok === false) {
      const rpcError = data?.error;
      if (import.meta.env.DEV && (boot.error || data?.detail)) {
        console.error("[bootstrap]", boot.error ?? data?.detail);
      }
      if (rpcError === "company_name_required" || rpcError === "invalid_company_name") {
        return {
          ok: false,
          code: "needs_company_name",
          error:
            "Não encontramos o nome do studio na sua conta. Volte ao cadastro e informe o nome do negócio.",
        };
      }
      if (rpcError === "unauthorized") {
        return {
          ok: false,
          code: "bootstrap_failed",
          error: "Sessão expirada. Faça login novamente.",
        };
      }
      return {
        ok: false,
        code: "bootstrap_failed",
        error:
          "Não foi possível criar seu studio. Verifique se as migrations do Supabase foram aplicadas e tente de novo.",
      };
    }

    await authService.updateCompanyNameMetadata(companyName);
    await opts.refreshAuth?.();
    if (opts.planId) {
      await opts.navigate({
        to: "/admin/plano/checkout",
        search: { planId: opts.planId, trial: false },
      });
      return { ok: true };
    }
    await opts.navigate({ to: "/admin/plano" });
    return { ok: true };
  }
  if (dest.href === "/admin" && opts.planId) {
    await opts.navigate({
      to: "/admin/plano/checkout",
      search: { planId: opts.planId, trial: false },
    });
    return { ok: true };
  }
  await opts.navigate({ to: dest.href });
  return { ok: true };
}
