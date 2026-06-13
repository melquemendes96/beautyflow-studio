import { getSupabase } from "@/lib/supabaseClient";
import type { DashboardRangeData } from "@/lib/intelligent-calendar-range";

export type CompanyDashboardSummary = {
  ok: boolean;
  error?: string;
  clients_count?: number;
  summary?: {
    today_appointments: number;
    today_revenue: number;
    today_commissions: number;
    week_appointments: number;
    week_revenue: number;
    week_commissions: number;
    month_appointments: number;
    month_revenue: number;
    month_commissions: number;
    attendance_rate_30d: number;
  };
};

export function formatCompanyMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const companyDashboardService = {
  async getSummary(companyId: string) {
    const res = await getSupabase().rpc("company_dashboard_summary", { p_company_id: companyId });
    return { ...res, data: res.data as CompanyDashboardSummary | null };
  },

  async getRange(companyId: string, startDate: string, endDate: string) {
    const res = await getSupabase().rpc("company_dashboard_range", {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    return { ...res, data: res.data as DashboardRangeData | null };
  },
};
