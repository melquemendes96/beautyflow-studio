import { redirect } from "@tanstack/react-router";
import { isMasterAccount, loadAuthProfile } from "@/lib/auth-profile";
import { emptyLoginSearch } from "@/lib/challenge-60";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  getSubscriptionAccessReason,
  isSubscriptionDashboardAllowed,
  type SubscriptionSnapshot,
} from "@/lib/subscription-access";
import { type FeatureKey, featureToPortugueseLabel, hasFeatureAccess } from "@/lib/plan-access";

const isBrowser = typeof document !== "undefined";

function skipGuardOnServer(): boolean {
  return !isBrowser;
}

function isBillingExemptPath(pathname: string): boolean {
  const p = pathname !== "/" && pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;
  const exempt = [
    "/admin/plano",
    "/admin/plano/checkout",
    "/billing/plans",
    "/billing/checkout",
    "/billing/success",
    "/billing/cancel",
    "/onboarding/company",
  ];
  if (exempt.some((e) => p === e || p.startsWith(`${e}/`))) return true;
  if (p === "/admin") return true;
  const prefixes = ["/admin/configuracoes", "/admin/servicos"];
  return prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

async function loadTenantSubscription(companyId: string): Promise<SubscriptionSnapshot | null> {
  const { data } = await getSupabase()
    .from("tenant_subscriptions")
    .select("status, current_period_start, current_period_end, trial_start, trial_end")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as SubscriptionSnapshot | null) ?? null;
}

/** Painel empresa: logado + vínculo em company_users. */
export async function guardCompanyAdminRoute(): Promise<void> {
  if (skipGuardOnServer()) return;
  if (!isSupabaseConfigured()) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
  const profile = await loadAuthProfile();
  if (!profile.session) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
  if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
    throw redirect({ to: "/master" });
  }
  if (profile.companyMemberships.length > 0) {
    return;
  }
  throw redirect({ to: "/onboarding/company" });
}

/** Bloqueia dashboard sem assinatura válida (active ou trialing no prazo). */
export async function guardCompanyTenantBillingAccess(pathname: string): Promise<void> {
  if (skipGuardOnServer()) return;
  if (isBillingExemptPath(pathname)) return;
  if (!isSupabaseConfigured()) return;

  const profile = await loadAuthProfile();
  if (!profile.session || profile.isPlatformAdmin) return;

  const companyId = profile.companyMemberships[0]?.company_id;
  if (!companyId) {
    throw redirect({ to: "/onboarding/company" });
  }

  const supabase = getSupabase();
  const [{ data: company }, sub] = await Promise.all([
    supabase.from("companies").select("status").eq("id", companyId).maybeSingle(),
    loadTenantSubscription(companyId),
  ]);

  if (company?.status === "suspended") {
    throw redirect({ to: "/billing/plans", search: { billing: "suspended" } });
  }

  if (!sub) {
    throw redirect({ to: "/billing/plans", search: { billing: "setup" } });
  }

  if (!isSubscriptionDashboardAllowed(sub)) {
    const reason = getSubscriptionAccessReason(sub);
    if (isProviderMembership(profile)) {
      const p =
        pathname !== "/" && pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;
      const providerAllowed =
        p === "/admin" ||
        p === "/admin/agenda" ||
        p.startsWith("/admin/agenda/") ||
        p === "/admin/clientes" ||
        p.startsWith("/admin/clientes/") ||
        p === "/admin/repasses" ||
        p.startsWith("/admin/repasses/") ||
        p === "/admin/app" ||
        p.startsWith("/admin/app/");
      if (!providerAllowed) {
        throw redirect({ to: "/admin", search: { billing: "expired" } });
      }
      return;
    }
    const billing =
      reason === "trial_expired" || reason === "period_ended"
        ? "expired"
        : reason === "no_subscription"
          ? "setup"
          : "renew";
    throw redirect({ to: "/billing/plans", search: { billing } });
  }
}

const PLAN_GATED_ADMIN_ROUTES: { prefix: string; feature: FeatureKey }[] = [
  { prefix: "/admin/branding", feature: "branding" },
  { prefix: "/admin/lista-espera", feature: "waitlist" },
  { prefix: "/admin/relatorios", feature: "reports" },
  { prefix: "/admin/whatsapp", feature: "whatsapp" },
  { prefix: "/admin/equipe", feature: "team" },
  { prefix: "/admin/produtos", feature: "inventory" },
  { prefix: "/admin/repasses", feature: "commissions" },
  { prefix: "/admin/financeiro", feature: "finance" },
];

const PROVIDER_BLOCKED_PREFIXES = [
  "/admin/comandas",
  "/admin/equipe",
  "/admin/plano",
  "/admin/branding",
  "/admin/whatsapp",
  "/admin/relatorios",
  "/admin/servicos",
  "/admin/configuracoes",
  "/admin/lista-espera",
  "/admin/produtos",
  "/admin/financeiro",
  "/admin/plano/checkout",
  "/billing",
  "/onboarding",
];

function isProviderMembership(profile: Awaited<ReturnType<typeof loadAuthProfile>>): boolean {
  const m = profile.companyMemberships[0];
  return m?.role === "provider" && Boolean(m.provider_id);
}

/** Prestador vinculado: dashboard + agenda (+ clientes na agenda). */
export async function guardProviderPanelAccess(pathname: string): Promise<void> {
  if (skipGuardOnServer()) return;
  if (!isSupabaseConfigured()) return;

  const profile = await loadAuthProfile();
  if (!profile.session || profile.isPlatformAdmin || !isProviderMembership(profile)) return;

  const p = pathname !== "/" && pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;

  const allowed =
    p === "/admin" ||
    p === "/admin/agenda" ||
    p.startsWith("/admin/agenda/") ||
    p === "/admin/clientes" ||
    p.startsWith("/admin/clientes/") ||
    p === "/admin/repasses" ||
    p.startsWith("/admin/repasses/") ||
    p === "/admin/app" ||
    p.startsWith("/admin/app/");

  if (!allowed && PROVIDER_BLOCKED_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))) {
    throw redirect({ to: "/admin" });
  }
}

export async function guardCompanyPlanFeatureAccess(pathname: string): Promise<void> {
  if (skipGuardOnServer()) return;
  const hit = PLAN_GATED_ADMIN_ROUTES.find((m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`));
  if (!hit) return;
  if (!isSupabaseConfigured()) return;

  const profile = await loadAuthProfile();
  if (!profile.session || profile.isPlatformAdmin) return;

  const isProvider = isProviderMembership(profile);
  const isProviderRepasses = isProvider && hit.prefix === "/admin/repasses";
  if (isProvider && !isProviderRepasses) {
    throw redirect({ to: "/admin" });
  }

  const companyId = profile.companyMemberships[0]?.company_id;
  if (!companyId) return;

  if (!isProvider) {
    const sub = await loadTenantSubscription(companyId);
    if (!isSubscriptionDashboardAllowed(sub)) {
      throw redirect({ to: "/billing/plans", search: { billing: "renew" } });
    }
  }

  const allowed = await hasFeatureAccess(companyId, hit.feature);
  if (!allowed) {
    // Prestador não gerencia plano — volta ao painel.
    if (isProvider) {
      throw redirect({ to: "/admin" });
    }
    throw redirect({
      to: "/admin/plano",
      search: {
        billing: "upgrade",
        checkout: undefined,
        need: featureToPortugueseLabel(hit.feature),
      },
    });
  }
}

/** Master: platform_admins / metadata master apenas. */
export async function guardMasterRoute(): Promise<void> {
  if (skipGuardOnServer()) return;
  if (!isSupabaseConfigured()) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
  const profile = await loadAuthProfile();
  if (!profile.session) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
  if (!profile.isPlatformAdmin && !isMasterAccount(profile.session)) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
}

/**
 * Rotas públicas de auth: não bloqueia navegação.
 * Redirect pós-login fica no cliente (usePublicAuthRedirect / LoginScreen).
 */
export async function guardPublicAuthRoute(_planId?: string): Promise<void> {
  return;
}

export const PublicRoute = guardPublicAuthRoute;
export const ProtectedRoute = guardCompanyAdminRoute;
export const CompanyAdminRoute = guardCompanyAdminRoute;
export const MasterRoute = guardMasterRoute;

/** Usuário autenticado sem empresa — onboarding. */
export async function OnboardingGuard(): Promise<void> {
  if (skipGuardOnServer()) return;
  if (!isSupabaseConfigured()) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
  const profile = await loadAuthProfile({ full: true });
  if (!profile.session) {
    throw redirect({ to: "/login", search: emptyLoginSearch });
  }
  if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
    throw redirect({ to: "/master" });
  }
  if (profile.companyMemberships.length > 0) {
    throw redirect({ to: "/admin" });
  }
}

/** Exige assinatura ativa (painel empresa). */
export const BillingGuard = guardCompanyTenantBillingAccess;
