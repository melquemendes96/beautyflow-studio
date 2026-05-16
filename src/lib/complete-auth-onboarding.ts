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
  | { ok: false; error: string; code?: "needs_company_name" | "bootstrap_failed" };

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
        code: "needs_company_name",
        error:
          "Informe o nome do seu studio no cadastro (mínimo 2 caracteres) antes de entrar no painel.",
      };
    }

    const boot = await onboardingService.bootstrapCompany({ companyName });
    const data = boot.data as { ok?: boolean; error?: string; slug?: string } | null;
    if (boot.error || data?.ok === false) {
      const rpcError = data?.error;
      if (rpcError === "company_name_required" || rpcError === "invalid_company_name") {
        return {
          ok: false,
          code: "needs_company_name",
          error:
            "Não encontramos o nome do studio na sua conta. Volte ao cadastro e informe o nome do negócio.",
        };
      }
      return {
        ok: false,
        code: "bootstrap_failed",
        error: "Não foi possível preparar seu studio. Tente novamente ou fale com o suporte.",
      };
    }

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
