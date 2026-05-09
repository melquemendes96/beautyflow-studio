import { redirect } from "@tanstack/react-router";
import { loadAuthProfile } from "@/lib/auth-profile";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  type PlanGatedFeature,
  featureToPortugueseLabel,
  planNameAllowsFeature,
} from "@/lib/plan-access";

const isBrowser = typeof document !== "undefined";

/** Evita redirect incorreto no SSR (sessão no cliente via localStorage). */
function skipGuardOnServer(): boolean {
  return !isBrowser;
}

/**
 * Rotas onde o tenant pode configurar o studio mesmo com cobrança pendente (past_due)
 * ou assinatura cancelada — evita travar cadastro de serviços/marca antes do pagamento.
 */
function isBillingRenewExemptPath(pathname: string): boolean {
  const p = pathname !== "/" && pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;
  if (p === "/admin") return true;
  const prefixes = ["/admin/branding", "/admin/configuracoes", "/admin/servicos"];
  return prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

/** Painel empresa: precisa estar logado e ter vínculo em company_users. */
export async function guardCompanyAdminRoute(): Promise<void> {
  if (skipGuardOnServer()) {
    return;
  }
  if (!isSupabaseConfigured()) {
    throw redirect({ to: "/login" });
  }
  const profile = await loadAuthProfile();
  if (!profile.session) {
    throw redirect({ to: "/login" });
  }
  if (profile.companyMemberships.length > 0) {
    return;
  }
  if (profile.isPlatformAdmin) {
    throw redirect({ to: "/master" });
  }
  throw redirect({ to: "/login" });
}

/**
 * Bloqueia rotas do painel empresa quando a empresa está suspensa ou a assinatura
 * não está em dia (exceto plano/checkout e páginas de configuração inicial durante cobrança pendente).
 */
export async function guardCompanyTenantBillingAccess(pathname: string): Promise<void> {
  if (skipGuardOnServer()) {
    return;
  }
  const exempt = ["/admin/plano", "/admin/plano/checkout"];
  if (exempt.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return;
  }
  if (!isSupabaseConfigured()) {
    return;
  }
  const profile = await loadAuthProfile();
  if (!profile.session || profile.isPlatformAdmin) {
    return;
  }
  const companyId = profile.companyMemberships[0]?.company_id;
  if (!companyId) {
    return;
  }

  const supabase = getSupabase();
  const [{ data: company }, { data: sub }] = await Promise.all([
    supabase.from("companies").select("status").eq("id", companyId).maybeSingle(),
    supabase.from("tenant_subscriptions").select("status, current_period_end").eq("company_id", companyId).maybeSingle(),
  ]);

  if (company?.status === "suspended") {
    throw redirect({ to: "/admin/plano", search: { billing: "suspended" } });
  }
  if (!sub) {
    throw redirect({ to: "/admin/plano", search: { billing: "setup" } });
  }

  const st = String(sub.status ?? "");
  const end = sub.current_period_end ? new Date(sub.current_period_end as string) : null;
  const periodEnded = Boolean(end && end.getTime() < Date.now());

  if (st === "canceled" || st === "past_due") {
    if (isBillingRenewExemptPath(pathname)) {
      return;
    }
    throw redirect({ to: "/admin/plano", search: { billing: "renew" } });
  }
  if ((st === "active" || st === "trialing") && periodEnded) {
    throw redirect({ to: "/admin/plano", search: { billing: "expired" } });
  }
}

/** Branding fica liberado para todos os planos (página pública no Essencial). */
const PLAN_GATED_ADMIN_ROUTES: { prefix: string; feature: PlanGatedFeature }[] = [
  { prefix: "/admin/lista-espera", feature: "waitlist" },
  { prefix: "/admin/relatorios", feature: "reports" },
  { prefix: "/admin/whatsapp", feature: "whatsapp" },
];

/**
 * Restringe rotas a planos Studio Pro / Elite conforme `plans.name`.
 */
export async function guardCompanyPlanFeatureAccess(pathname: string): Promise<void> {
  if (skipGuardOnServer()) {
    return;
  }
  const hit = PLAN_GATED_ADMIN_ROUTES.find((m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`));
  if (!hit) {
    return;
  }
  if (!isSupabaseConfigured()) {
    return;
  }
  const profile = await loadAuthProfile();
  if (!profile.session || profile.isPlatformAdmin) {
    return;
  }
  const companyId = profile.companyMemberships[0]?.company_id;
  if (!companyId) {
    return;
  }

  const supabase = getSupabase();
  const { data: sub } = await supabase
    .from("tenant_subscriptions")
    .select("status, plans(name)")
    .eq("company_id", companyId)
    .maybeSingle();

  const st = String(sub?.status ?? "");
  if (st !== "active" && st !== "trialing") {
    throw redirect({ to: "/admin/plano", search: { billing: "renew" } });
  }

  const planName = (sub?.plans as { name?: string | null } | null)?.name;
  if (!planNameAllowsFeature(planName, hit.feature)) {
    throw redirect({
      to: "/admin/plano",
      search: { billing: "upgrade", need: featureToPortugueseLabel(hit.feature) },
    });
  }
}

/** Painel master: precisa estar logado e constar em platform_admins. */
export async function guardMasterRoute(): Promise<void> {
  if (skipGuardOnServer()) {
    return;
  }
  if (!isSupabaseConfigured()) {
    throw redirect({ to: "/login" });
  }
  const profile = await loadAuthProfile();
  if (!profile.session) {
    throw redirect({ to: "/login" });
  }
  if (!profile.isPlatformAdmin) {
    throw redirect({ to: "/admin" });
  }
}

/**
 * Rotas públicas de login: se já autenticado, envia ao painel adequado.
 */
export async function guardPublicAuthRoute(): Promise<void> {
  if (skipGuardOnServer()) {
    return;
  }
  if (!isSupabaseConfigured()) {
    return;
  }
  const profile = await loadAuthProfile();
  if (!profile.session) {
    return;
  }
  if (profile.companyMemberships.length > 0) {
    throw redirect({ to: "/admin" });
  }
  if (profile.isPlatformAdmin) {
    throw redirect({ to: "/master" });
  }
}

/** Use em `beforeLoad` das rotas — nomes alinhados à especificação da Fase 4. */
export const PublicRoute = guardPublicAuthRoute;
export const CompanyAdminRoute = guardCompanyAdminRoute;
export const MasterRoute = guardMasterRoute;
