import { getSupabase } from "@/lib/supabaseClient";

export type ProviderCommissionPeriod = {
  kind: "week" | "biweek" | "month";
  start_date: string;
  end_date: string;
  revenue: number;
  commission: number;
  appointments: number;
};

export type ProviderCommissionDashboard = {
  ok: boolean;
  error?: string;
  provider_id?: string;
  display_name?: string;
  commission_pct?: number;
  summary?: {
    today_revenue: number;
    today_commission: number;
    today_appointments: number;
    week_revenue: number;
    week_commission: number;
    week_appointments: number;
    month_revenue: number;
    month_commission: number;
    month_appointments: number;
  };
  periods?: ProviderCommissionPeriod[];
};

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatProviderMoney(value: number) {
  return formatBrl(Number.isFinite(value) ? value : 0);
}

export const providerService = {
  async getCommissionDashboard(companyId: string) {
    const res = await getSupabase().rpc("provider_commission_dashboard", { p_company_id: companyId });
    return { ...res, data: res.data as ProviderCommissionDashboard | null };
  },
};

export function periodKindLabel(kind: ProviderCommissionPeriod["kind"]) {
  switch (kind) {
    case "week":
      return "Semana";
    case "biweek":
      return "Quinzena";
    case "month":
      return "Mês";
    default:
      return kind;
  }
}

export function formatPeriodRange(start: string, end: string) {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  return `${s.toLocaleDateString("pt-BR")} – ${e.toLocaleDateString("pt-BR")}`;
}
