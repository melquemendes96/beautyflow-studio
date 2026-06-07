import { getSupabase } from "@/lib/supabaseClient";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";

export type ClientPackageRow = {
  id: string;
  client_id: string;
  client_name?: string;
  service_id: string;
  service_name?: string;
  total_sessions: number;
  used_sessions: number;
  status: string;
  paid_at?: string | null;
  expires_at?: string | null;
  notes?: string | null;
  session_label?: string;
  remaining?: number;
};

export type PackageLookupResult = {
  ok: boolean;
  found?: boolean;
  client_package_id?: string;
  client_name?: string;
  used_sessions?: number;
  total_sessions?: number;
  remaining?: number;
  session_label?: string;
  is_last_session?: boolean;
  allowed_dow?: number[];
  max_per_week?: number;
  holidays?: string[];
  expires_at?: string | null;
  provider_id?: string | null;
  provider_name?: string | null;
  pending_payment?: boolean;
  error?: string;
};

export type PendingClientPackage = {
  id: string;
  client_id: string;
  client_name: string;
  client_whatsapp: string | null;
  service_id: string;
  service_name: string;
  service_price: number;
  total_sessions: number;
  provider_id: string | null;
  provider_name: string | null;
  provider_color: string | null;
  appointment_id: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  created_at: string;
};

export const packageService = {
  async listByCompany(companyId: string, clientId?: string) {
    const res = await getSupabase().rpc("admin_list_client_packages", {
      p_company_id: companyId,
      p_client_id: clientId ?? null,
    });
    const payload = res.data as { ok?: boolean; packages?: ClientPackageRow[] } | null;
    return { ...res, data: payload?.packages ?? [] };
  },

  activate(
    companyId: string,
    input: {
      clientId: string;
      serviceId: string;
      totalSessions?: number;
      expiresAt?: string | null;
      notes?: string | null;
    },
  ) {
    return getSupabase().rpc("admin_activate_client_package", {
      p_company_id: companyId,
      p_client_id: input.clientId,
      p_service_id: input.serviceId,
      p_total_sessions: input.totalSessions ?? null,
      p_expires_at: input.expiresAt ?? null,
      p_notes: input.notes ?? null,
    });
  },

  lookupPackage(params: { slug: string; whatsapp: string; serviceId: string }) {
    return getSupabase().rpc("lookup_client_package", {
      p_slug: normalizePublicBookingSlug(params.slug),
      p_whatsapp: params.whatsapp,
      p_service_id: params.serviceId,
    });
  },

  async listPending(companyId: string) {
    const res = await getSupabase().rpc("list_pending_client_packages", {
      p_company_id: companyId,
    });
    const payload = res.data as { ok?: boolean; packages?: PendingClientPackage[]; error?: string } | null;
    if (payload?.ok === false) {
      return { ...res, data: [] as PendingClientPackage[], error: payload.error };
    }
    return { ...res, data: payload?.packages ?? [] };
  },

  confirmPayment(companyId: string, clientPackageId: string) {
    return getSupabase().rpc("confirm_client_package_payment", {
      p_company_id: companyId,
      p_client_package_id: clientPackageId,
    });
  },

  convertToSingle(companyId: string, clientPackageId: string) {
    return getSupabase().rpc("convert_client_package_to_single", {
      p_company_id: companyId,
      p_client_package_id: clientPackageId,
    });
  },
};
