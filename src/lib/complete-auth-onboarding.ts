import { authService } from "@/services/authService";
import { getPostLoginDestination } from "@/lib/post-login-redirect";
import { onboardingService } from "@/services/onboardingService";

type NavigateFn = (opts: {
  to: string;
  search?: Record<string, unknown>;
  replace?: boolean;
}) => Promise<void>;

export async function navigateAfterAuthenticatedSession(opts: {
  navigate: NavigateFn;
  planId?: string;
  companyName?: string | null;
  /** Obrigatório no fluxo de login/cadastro: após RPC `user_bootstrap_company` o contexto React ainda pode estar sem vínculos. */
  refreshAuth?: () => Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const dest = await getPostLoginDestination();
  if (!dest.ok) {
    const boot = await onboardingService.bootstrapCompany({
      companyName: opts.companyName?.trim() ? opts.companyName.trim() : null,
    });
    const data = boot.data as { ok?: boolean } | null;
    if (boot.error || data?.ok === false) {
      await authService.signOut();
      return {
        ok: false,
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
