import type { Session } from "@supabase/supabase-js";
import { withAuthTimeout } from "@/lib/auth-bootstrap";
import { isMasterAccount, loadAuthProfile, type AuthProfile } from "@/lib/auth-profile";
import {
  navigateToAuthDestination,
  resolveAuthDestinationFromContext,
  type AuthDestination,
  type NavigateFn,
} from "@/lib/auth-routing";
import { readOAuthFlowContext } from "@/lib/oauth-signup-intent";
import { onboardingService } from "@/services/onboardingService";
import { profileService } from "@/services/profileService";

const POST_LOGIN_TIMEOUT_MS = 20_000;
const BOOTSTRAP_TIMEOUT_MS = 25_000;

let bootstrapInFlight: Promise<BootstrapResult> | null = null;

export type PostLoginRoute =
  | "/master/empresas"
  | "/admin"
  | "/onboarding/company"
  | "/billing/plans";

export type BootstrapResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string; code?: "needs_company_name" | "unauthorized" | "timeout" | "rpc_error" };

export function getPendingStudioName(session: Session | null): string | null {
  if (!session) return null;
  const ctx = readOAuthFlowContext();
  if (ctx?.companyName?.trim() && ctx.companyName.trim().length >= 2) {
    return ctx.companyName.trim();
  }
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = meta?.company_name;
  if (typeof fromMeta === "string" && fromMeta.trim().length >= 2) return fromMeta.trim();
  return null;
}

export async function loadPostLoginProfile(): Promise<AuthProfile> {
  return withAuthTimeout(loadAuthProfile({ waitForSession: false, full: true }), POST_LOGIN_TIMEOUT_MS);
}

/** Destino após autenticação — sem polling waitForSession. */
export async function resolvePostLoginDestination(opts?: {
  planId?: string;
  preferTrial?: boolean;
  profile?: AuthProfile;
}): Promise<AuthDestination> {
  const profile = opts?.profile ?? (await loadPostLoginProfile());

  if (!profile.session) {
    return { kind: "login", path: "/login" };
  }

  if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
    return { kind: "master", path: "/master/empresas" };
  }

  if (profile.companyMemberships.length === 0) {
    return { kind: "onboarding_company", path: "/onboarding/company" };
  }

  return resolveAuthDestinationFromContext(profile, {
    planId: opts?.planId,
    preferTrial: opts?.preferTrial,
  });
}

/** Cria empresa + vínculos se ainda não existir (uma execução por vez). */
export async function ensureUserCompanyBootstrap(opts: {
  companyName?: string | null;
  session?: Session | null;
}): Promise<BootstrapResult> {
  if (bootstrapInFlight) return bootstrapInFlight;

  const run = (async (): Promise<BootstrapResult> => {
    const profile = await loadPostLoginProfile();
    if (!profile.session) {
      return { ok: false, code: "unauthorized", error: "Sessão expirada. Faça login novamente." };
    }

    const existingId = profile.companyMemberships[0]?.company_id;
    if (existingId) {
      return { ok: true, companyId: existingId };
    }

    const name = (opts.companyName?.trim() || getPendingStudioName(profile.session) || "").trim();
    if (name.length < 2) {
      return {
        ok: false,
        code: "needs_company_name",
        error: "Informe o nome do seu negócio para continuar.",
      };
    }

    await profileService.ensureProfile().catch(() => undefined);

    const boot = await withAuthTimeout(
      onboardingService.bootstrapCompany({ companyName: name }),
      BOOTSTRAP_TIMEOUT_MS,
    );

    const data = boot.data as { ok?: boolean; error?: string; company_id?: string } | null;
    if (boot.error) {
      return {
        ok: false,
        code: "rpc_error",
        error: boot.error.message || "Não foi possível criar sua empresa.",
      };
    }
    if (data?.ok === false) {
      if (data.error === "company_name_required" || data.error === "invalid_company_name") {
        return { ok: false, code: "needs_company_name", error: "Informe um nome de empresa válido." };
      }
      return {
        ok: false,
        code: "rpc_error",
        error: "Não foi possível criar sua empresa. Tente novamente.",
      };
    }

    const companyId = data?.company_id ? String(data.company_id) : "";
    if (!companyId) {
      return { ok: false, code: "rpc_error", error: "Empresa criada sem identificador. Tente novamente." };
    }

    return { ok: true, companyId };
  })();

  bootstrapInFlight = run;
  try {
    return await run;
  } finally {
    bootstrapInFlight = null;
  }
}

export async function runPostLoginNavigation(opts: {
  navigate: NavigateFn;
  planId?: string;
  companyName?: string | null;
  preferTrial?: boolean;
  refreshAuth?: () => Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    await profileService.ensureProfile().catch(() => undefined);

    let profile = await loadPostLoginProfile();

    if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
      await opts.refreshAuth?.();
      await navigateToAuthDestination(
        opts.navigate,
        { kind: "master", path: "/master/empresas" },
        true,
      );
      return { ok: true };
    }

    if (profile.companyMemberships.length === 0) {
      const pendingName = opts.companyName?.trim() || getPendingStudioName(profile.session);
      if (pendingName) {
        const boot = await ensureUserCompanyBootstrap({
          companyName: pendingName,
          session: profile.session,
        });
        if (!boot.ok) {
          if (boot.code === "needs_company_name") {
            await navigateToAuthDestination(
              opts.navigate,
              { kind: "onboarding_company", path: "/onboarding/company" },
              true,
            );
            return { ok: false, error: boot.error, code: boot.code };
          }
          return { ok: false, error: boot.error, code: boot.code };
        }
        await opts.refreshAuth?.();
        profile = await loadPostLoginProfile();
      } else {
        await navigateToAuthDestination(
          opts.navigate,
          { kind: "onboarding_company", path: "/onboarding/company" },
          true,
        );
        return { ok: true };
      }
    }

    const dest = await resolvePostLoginDestination({
      planId: opts.planId,
      preferTrial: opts.preferTrial,
      profile,
    });

    await opts.refreshAuth?.();
    await navigateToAuthDestination(opts.navigate, dest, true);
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error && e.message === "auth_timeout"
        ? "A operação demorou demais. Verifique sua conexão e tente novamente."
        : e instanceof Error
          ? e.message
          : "Erro ao concluir login.";
    return { ok: false, error: msg, code: "timeout" };
  }
}
