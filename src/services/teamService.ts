import { getSupabase } from "@/lib/supabaseClient";

export type ServiceProviderRow = {
  id: string;
  company_id: string;
  display_name: string;
  photo_url: string | null;
  color: string | null;
  is_owner: boolean;
  active: boolean;
  default_commission_pct: number | null;
  sort_order: number;
  service_ids: string[];
};

export type TeamListResult = {
  ok: boolean;
  slot_limit?: number;
  active_count?: number;
  providers?: ServiceProviderRow[];
  error?: string;
};

export const teamService = {
  async list(companyId: string) {
    const res = await getSupabase().rpc("admin_list_service_providers", { p_company_id: companyId });
    return { ...res, data: res.data as TeamListResult | null };
  },

  async upsert(
    companyId: string,
    input: {
      providerId?: string | null;
      displayName: string;
      photoUrl?: string | null;
      color?: string | null;
      isOwner?: boolean;
      active?: boolean;
      defaultCommissionPct?: number | null;
      sortOrder?: number;
      serviceIds?: string[];
    },
  ) {
    const res = await getSupabase().rpc("admin_upsert_service_provider", {
      p_company_id: companyId,
      p_provider_id: input.providerId ?? null,
      p_display_name: input.displayName,
      p_photo_url: input.photoUrl ?? null,
      p_color: input.color ?? null,
      p_is_owner: input.isOwner ?? false,
      p_active: input.active ?? true,
      p_default_commission_pct: input.defaultCommissionPct ?? null,
      p_sort_order: input.sortOrder ?? 0,
      p_service_ids: input.serviceIds ?? [],
    });
    return res;
  },

  delete(companyId: string, providerId: string) {
    return getSupabase().rpc("admin_delete_service_provider", {
      p_company_id: companyId,
      p_provider_id: providerId,
    });
  },
};
