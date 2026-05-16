import { getSupabase } from "@/lib/supabaseClient";

async function syncMasterAccess(): Promise<void> {
  await getSupabase().rpc("ensure_platform_admin");
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
 * Escritas usam tabelas com is_platform_admin() após ensure_platform_admin.
 */
export const masterService = {
  async listCompanies() {
    await syncMasterAccess();
    const rpc = await getSupabase().rpc("master_list_companies");
    if (!rpc.error) return rpc;
    return getSupabase().from("companies").select("*").order("created_at", { ascending: false });
  },

  async listPlans() {
    await syncMasterAccess();
    const rpc = await getSupabase().rpc("master_list_plans");
    if (!rpc.error) return rpc;
    return getSupabase().from("plans").select("*").order("price");
  },

  async createCompany(input: { name: string; slug: string; email?: string; phone?: string; plan_id?: string | null }) {
    await syncMasterAccess();
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
    await syncMasterAccess();
    const res = await getSupabase().from("companies").update(patch).eq("id", companyId).select("*").single();
    if (res.error) return res;
    if (Object.prototype.hasOwnProperty.call(patch, "plan_id")) {
      const sync = await syncTenantSubscriptionFromMasterPlan(companyId, patch.plan_id ?? null);
      if (sync.error) return { ...res, error: sync.error };
    }
    return res;
  },

  async createPlan(input: { name: string; price: number; features: string[]; active: boolean }) {
    await syncMasterAccess();
    return getSupabase()
      .from("plans")
      .insert({
        name: input.name,
        price: input.price,
        features: input.features,
        active: input.active,
      })
      .select("*")
      .single();
  },

  async updatePlan(planId: string, patch: { name?: string; price?: number; features?: string[]; active?: boolean }) {
    await syncMasterAccess();
    return getSupabase().from("plans").update(patch).eq("id", planId).select("*").single();
  },

  async deletePlan(planId: string) {
    await syncMasterAccess();
    return getSupabase().from("plans").delete().eq("id", planId);
  },

  async listRecentPaidPayments(limit = 40) {
    await syncMasterAccess();
    return getSupabase()
      .from("payment_transactions")
      .select("id, amount, paid_at, created_at, status, companies(name, slug)")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(limit);
  },

  async listRecentSupportTicketsWithCompany(limit = 40) {
    await syncMasterAccess();
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
    await syncMasterAccess();
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
    await syncMasterAccess();
    return getSupabase().from("coupons").update(patch).eq("id", couponId).select("*").single();
  },

  async listSubscriptions() {
    await syncMasterAccess();
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
    await syncMasterAccess();
    return getSupabase().from("tenant_subscriptions").update(patch).eq("id", subscriptionId).select("*").single();
  },

  async listPayments() {
    await syncMasterAccess();
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
    await syncMasterAccess();
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
    await syncMasterAccess();
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
    await syncMasterAccess();
    return getSupabase()
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });
  },

  async listCoupons() {
    await syncMasterAccess();
    return getSupabase().from("coupons").select("*").order("created_at", { ascending: false });
  },
};
