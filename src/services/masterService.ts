import { getSupabase } from "@/lib/supabaseClient";
import { waitForValidSession } from "@/lib/wait-for-auth-session";

async function requireMasterSession() {
  const session = await waitForValidSession(6);
  if (!session?.access_token) {
    return { ok: false as const, error: { message: "Sessão expirada. Faça login novamente.", status: 401 } };
  }

  const { data, error } = await getSupabase().rpc("ensure_platform_admin");
  if (error) {
    return { ok: false as const, error };
  }

  const payload = data as { ok?: boolean; is_platform_admin?: boolean } | null;
  if (payload?.ok !== true && payload?.is_platform_admin !== true) {
    return {
      ok: false as const,
      error: { message: "Acesso negado: usuário não é platform_admin.", status: 403 },
    };
  }

  return { ok: true as const };
}

async function syncTenantSubscriptionFromMasterPlan(companyId: string, planId: string | null) {
  const supabase = getSupabase();
  if (!planId) {
    return supabase.from("tenant_subscriptions").update({ status: "canceled" }).eq("company_id", companyId);
  }
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  const payload = {
    plan_id: planId,
    status: "active" as const,
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    last_plan_change_at: start.toISOString(),
  };
  const existing = await supabase.from("tenant_subscriptions").select("id").eq("company_id", companyId).maybeSingle();
  if (existing.error) return existing;
  if (existing.data?.id) {
    return supabase.from("tenant_subscriptions").update(payload).eq("company_id", companyId);
  }
  return supabase.from("tenant_subscriptions").insert({
    company_id: companyId,
    ...payload,
    trial_used: false,
  });
}

/**
 * Painel master — leituras via RPC SECURITY DEFINER (RLS-safe).
 * Planos: CRUD via RPC master_* (não depende só de policy na tabela).
 */
export const masterService = {
  async listCompanies() {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    const rpc = await getSupabase().rpc("master_list_companies");
    if (!rpc.error) return rpc;
    return getSupabase().from("companies").select("*").order("created_at", { ascending: false });
  },

  async listPlans() {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().rpc("master_list_plans");
  },

  async createCompany(input: { name: string; slug: string; email?: string; phone?: string; plan_id?: string | null }) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    const res = await getSupabase()
      .from("companies")
      .insert({
        name: input.name,
        slug: input.slug,
        email: input.email ?? null,
        phone: input.phone ?? null,
        plan_id: input.plan_id ?? null,
        status: "active",
        onboarding_completed: true,
      })
      .select("*")
      .single();
    if (res.error) return res;
    const row = res.data as { id: string; plan_id?: string | null };
    if (row.plan_id) {
      const sync = await syncTenantSubscriptionFromMasterPlan(row.id, row.plan_id);
      if (sync.error) return { ...res, error: sync.error };
    }
    return res;
  },

  async updateCompany(companyId: string, patch: { status?: string; plan_id?: string | null }) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    const res = await getSupabase().from("companies").update(patch).eq("id", companyId).select("*").single();
    if (res.error) return res;
    if (Object.prototype.hasOwnProperty.call(patch, "plan_id")) {
      const sync = await syncTenantSubscriptionFromMasterPlan(companyId, patch.plan_id ?? null);
      if (sync.error) return { ...res, error: sync.error };
    }
    return res;
  },

  async createPlan(input: { name: string; price: number; features: string[]; active: boolean }) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().rpc("master_create_plan", {
      p_name: input.name,
      p_price: input.price,
      p_features: input.features,
      p_active: input.active,
    });
  },

  async updatePlan(planId: string, patch: { name?: string; price?: number; features?: string[]; active?: boolean }) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().rpc("master_update_plan", {
      p_plan_id: planId,
      p_name: patch.name ?? null,
      p_price: patch.price ?? null,
      p_features: patch.features ?? null,
      p_active: patch.active ?? null,
    });
  },

  async deletePlan(planId: string) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().rpc("master_delete_plan", { p_plan_id: planId });
  },

  async listRecentPaidPayments(limit = 40) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase()
      .from("payment_transactions")
      .select("id, amount, paid_at, created_at, status, companies(name, slug)")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(limit);
  },

  async listRecentSupportTicketsWithCompany(limit = 40) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase()
      .from("support_tickets")
      .select("id, subject, status, created_at, companies(name, slug)")
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  async createCoupon(input: {
    code: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    active: boolean;
    expires_at?: string | null;
  }) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase()
      .from("coupons")
      .insert({
        code: input.code,
        discount_type: input.discount_type,
        discount_value: input.discount_value,
        active: input.active,
        expires_at: input.expires_at ?? null,
      })
      .select("*")
      .single();
  },

  async updateCoupon(
    couponId: string,
    patch: { discount_type?: "percent" | "fixed"; discount_value?: number; active?: boolean; expires_at?: string | null },
  ) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().from("coupons").update(patch).eq("id", couponId).select("*").single();
  },

  async listSubscriptions() {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    const rpc = await getSupabase().rpc("master_list_subscriptions");
    if (!rpc.error && rpc.data) {
      const rows = (rpc.data as Record<string, unknown>[]).map((row) => ({
        ...row,
        companies: {
          name: row.company_name ?? null,
          slug: row.company_slug ?? null,
        },
        plans: {
          name: row.plan_name ?? null,
          price: row.plan_price ?? null,
        },
      }));
      return { ...rpc, data: rows };
    }
    return getSupabase()
      .from("tenant_subscriptions")
      .select("*, companies(name, slug), plans(name, price)")
      .order("updated_at", { ascending: false });
  },

  async updateSubscription(
    subscriptionId: string,
    patch: {
      plan_id?: string;
      status?: string;
      current_period_start?: string | null;
      current_period_end?: string | null;
    },
  ) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().from("tenant_subscriptions").update(patch).eq("id", subscriptionId).select("*").single();
  },

  async listPayments() {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase()
      .from("payment_transactions")
      .select("*, companies(name, slug), tenant_subscriptions(status, current_period_end, plan_id)")
      .order("created_at", { ascending: false });
  },

  async createPayment(input: {
    company_id: string;
    tenant_subscription_id?: string | null;
    amount: number;
    status: string;
    payment_method?: string | null;
    due_date?: string | null;
    paid_at?: string | null;
    gateway_provider?: string;
  }) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase()
      .from("payment_transactions")
      .insert({
        company_id: input.company_id,
        tenant_subscription_id: input.tenant_subscription_id ?? null,
        amount: input.amount,
        status: input.status,
        payment_method: input.payment_method ?? null,
        due_date: input.due_date ?? null,
        paid_at: input.paid_at ?? null,
        gateway_provider: input.gateway_provider ?? "manual",
      })
      .select("*")
      .single();
  },

  async updatePayment(
    paymentId: string,
    patch: { status?: string; paid_at?: string | null; due_date?: string | null; payment_method?: string | null },
  ) {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().from("payment_transactions").update(patch).eq("id", paymentId).select("*").single();
  },

  applyPaymentAndRenew(input: { payment_id: string; months?: number }) {
    return getSupabase().rpc("master_apply_payment", {
      p_payment_id: input.payment_id,
      p_months: input.months ?? 1,
    });
  },

  applyPaymentAndRenewV2(input: { payment_id: string; months?: number; allow_canceled?: boolean }) {
    return getSupabase().rpc("master_apply_payment", {
      p_payment_id: input.payment_id,
      p_months: input.months ?? 1,
      p_allow_canceled: input.allow_canceled ?? false,
    });
  },

  createPendingInvoice(input: { subscription_id: string; due_date?: string | null }) {
    return getSupabase().rpc("master_create_pending_invoice", {
      p_subscription_id: input.subscription_id,
      p_due_date: input.due_date ?? null,
    });
  },

  async listSupportTickets() {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase()
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });
  },

  async listCoupons() {
    const gate = await requireMasterSession();
    if (!gate.ok) return { data: null, error: gate.error };
    return getSupabase().from("coupons").select("*").order("created_at", { ascending: false });
  },
};
