import type { Session } from "@supabase/supabase-js";
import {
  isMasterAccount,
  loadAuthProfile,
  type AuthProfile,
  type CompanyMembership,
} from "@/lib/auth-profile";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  getSubscriptionAccessReason,
  isSubscriptionDashboardAllowed,
  type SubscriptionSnapshot,
} from "@/lib/subscription-access";

export type AuthDestination =
  | { kind: "master"; path: "/master" }
  | { kind: "onboarding_company"; path: "/onboarding/company" }
  | { kind: "billing"; path: "/billing/plans"; search?: Record<string, string> }
  | { kind: "billing_checkout"; path: "/billing/checkout"; search: { planId: string; trial?: string } }
  | { kind: "dashboard"; path: "/dashboard" }
  | { kind: "login"; path: "/login" }
  | { kind: "stay"; path: null };

export type ResolveAuthDestinationOpts = {
  planId?: string;
  preferTrial?: boolean;
};

async function fetchTenantSubscription(
  companyId: string,
): Promise<SubscriptionSnapshot | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data } = await supabase
    .from("tenant_subscriptions")
    .select("status, current_period_start, current_period_end, trial_start, trial_end")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  return data as SubscriptionSnapshot;
}

async function fetchCompanyStatus(companyId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from("companies")
    .select("status")
    .eq("id", companyId)
    .maybeSingle();
  return data?.status ? String(data.status) : null;
}

export function resolveAuthDestinationFromProfile(
  profile: AuthProfile,
  opts?: ResolveAuthDestinationOpts & {
    subscription?: SubscriptionSnapshot | null;
    companyStatus?: string | null;
  },
): AuthDestination {
  if (!profile.session) {
    return { kind: "login", path: "/login" };
  }

  if (profile.authConfigError) {
    return { kind: "stay", path: null };
  }

  if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
    return { kind: "master", path: "/master" };
  }

  const memberships = profile.companyMemberships;
  if (memberships.length === 0) {
    return { kind: "onboarding_company", path: "/onboarding/company" };
  }

  if (opts?.companyStatus === "suspended") {
    return {
      kind: "billing",
      path: "/billing/plans",
      search: { billing: "suspended" },
    };
  }

  const sub = opts?.subscription ?? null;
  const access = getSubscriptionAccessReason(sub);

  if (!isSubscriptionDashboardAllowed(sub)) {
    if (opts?.planId) {
      return {
        kind: "billing_checkout",
        path: "/billing/checkout",
        search: {
          planId: opts.planId,
          trial: opts.preferTrial === false ? "false" : "true",
        },
      };
    }
    const billingFlag =
      access === "trial_expired"
        ? "expired"
        : access === "no_subscription"
          ? "setup"
          : access === "past_due" || access === "canceled"
            ? "renew"
            : access === "pending_payment"
              ? "pending"
              : "renew";
    return {
      kind: "billing",
      path: "/billing/plans",
      search: { billing: billingFlag },
    };
  }

  if (opts?.planId) {
    return {
      kind: "billing_checkout",
      path: "/billing/checkout",
      search: { planId: opts.planId, trial: "false" },
    };
  }

  return { kind: "dashboard", path: "/dashboard" };
}

export async function resolveAuthDestination(
  opts?: ResolveAuthDestinationOpts & { session?: Session | null },
): Promise<AuthDestination> {
  const profile = await loadAuthProfile({ waitForSession: true });
  if (opts?.session && profile.session?.user.id !== opts.session.user.id) {
    // profile já carregou sessão atual
  }

  if (!profile.session) {
    return { kind: "login", path: "/login" };
  }

  if (profile.isPlatformAdmin || isMasterAccount(profile.session)) {
    return { kind: "master", path: "/master" };
  }

  const companyId = profile.companyMemberships[0]?.company_id;
  if (!companyId) {
    return { kind: "onboarding_company", path: "/onboarding/company" };
  }

  const [subscription, companyStatus] = await Promise.all([
    fetchTenantSubscription(companyId),
    fetchCompanyStatus(companyId),
  ]);

  return resolveAuthDestinationFromProfile(profile, {
    ...opts,
    subscription,
    companyStatus,
  });
}

export type NavigateFn = (opts: {
  to: string;
  search?: Record<string, unknown>;
  replace?: boolean;
}) => Promise<void>;

export async function navigateToAuthDestination(
  navigate: NavigateFn,
  dest: AuthDestination,
  replace = true,
): Promise<void> {
  if (dest.kind === "stay" || !dest.path) return;
  await navigate({
    to: dest.path,
    search: "search" in dest && dest.search ? dest.search : undefined,
    replace,
  });
}

export function membershipCompanyId(memberships: CompanyMembership[]): string | null {
  return memberships[0]?.company_id ?? null;
}
