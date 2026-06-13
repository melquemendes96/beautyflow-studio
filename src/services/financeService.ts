import { getSupabase } from "@/lib/supabaseClient";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";

export type FinancialEntryType = "fixed" | "variable" | "prolabore" | "tax" | "other";

export type FinancialEntry = {
  id: string;
  entry_type: FinancialEntryType;
  category: string;
  description: string;
  amount: number;
  entry_date: string;
  paid_at?: string | null;
  is_paid: boolean;
  recurrence: "none" | "monthly" | "yearly";
  notes?: string | null;
  created_at?: string;
};

export type DreLine = {
  key: string;
  label: string;
  amount: number;
  kind: "credit" | "debit" | "subtotal" | "total";
  level: number;
  parent?: string | null;
};

export type FinancialDre = {
  ok: boolean;
  error?: string;
  period?: { start: string; end: string };
  revenue?: { services: number; products: number; total: number };
  cogs?: { products: number; consumables: number; total: number };
  gross_profit?: number;
  commissions_paid?: number;
  expenses?: {
    fixed: number;
    variable: number;
    prolabore: number;
    tax: number;
    other: number;
    total: number;
  };
  operating_result?: number;
  net_result?: number;
  margin_pct?: number;
  lines?: DreLine[];
  commissions_basis?: string;
};

export type FinancialCashFlow = {
  ok: boolean;
  error?: string;
  period?: { start: string; end: string };
  inflows?: number;
  inflows_by_method?: Record<string, number>;
  outflows?: { commissions: number; expenses: number; total: number };
  net_cash?: number;
};

export type FinancialTrendMonth = {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  net_result: number;
};

export type DrillDownItem = {
  date: string;
  description: string;
  amount: number;
  reference: string;
  reference_type: string;
};

export type FinanceRpcResult<T> = ({ ok: true } & T) | { ok: false; error: string; message?: string };

function mapRpcError(error: unknown, fallback = "Operação indisponível."): FinanceRpcResult<never> {
  const msg = formatSupabaseApiError(error, fallback);
  if (msg.includes("PGRST202") || msg.includes("Could not find the function")) {
    return {
      ok: false,
      error: "rpc_ausente",
      message:
        "Gestão financeira ainda não aplicada no Supabase. Execute supabase/migrations/20260615000000_financial_management.sql.",
    };
  }
  return { ok: false, error: msg, message: msg };
}

function parsePayload<T extends Record<string, unknown>>(
  data: unknown,
  fallback = "Operação indisponível.",
): FinanceRpcResult<T> {
  const payload = data as ({ ok?: boolean; error?: string; message?: string } & T) | null;
  if (!payload || payload.ok === false) {
    const code = payload?.error ?? fallback;
    const labels: Record<string, string> = {
      forbidden: "Sem permissão ou recurso Gestão Financeira não está no seu plano.",
      feature_required: "Gestão Financeira não está no seu plano.",
      periodo_invalido: "Período inválido.",
      valor_invalido: "Informe um valor válido.",
      tipo_invalido: "Tipo de lançamento inválido.",
      nao_encontrado: "Lançamento não encontrado.",
      linha_invalida: "Linha da DRE inválida.",
    };
    return {
      ok: false,
      error: code,
      message: payload?.message ?? labels[code] ?? formatSupabaseApiError(code, fallback),
    };
  }
  return payload as FinanceRpcResult<T> & { ok: true };
}

async function callRpc<T extends Record<string, unknown>>(
  fn: () => Promise<{ data: unknown; error: unknown }>,
): Promise<FinanceRpcResult<T>> {
  const res = await fn();
  if (res.error) return mapRpcError(res.error);
  return parsePayload<T>(res.data);
}

export const ENTRY_TYPE_LABELS: Record<FinancialEntryType, string> = {
  fixed: "Custo fixo",
  variable: "Custo variável",
  prolabore: "Pró-labore",
  tax: "Imposto / taxa",
  other: "Outro",
};

export const financeService = {
  async getDre(companyId: string, startDate: string, endDate: string) {
    return callRpc<FinancialDre>(() =>
      getSupabase().rpc("company_financial_dre", {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate,
      }),
    );
  },

  async getCashFlow(companyId: string, startDate: string, endDate: string) {
    return callRpc<FinancialCashFlow>(() =>
      getSupabase().rpc("company_financial_cash_flow", {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate,
      }),
    );
  },

  async getTrend(companyId: string, months = 6) {
    return callRpc<{ months: FinancialTrendMonth[] }>(() =>
      getSupabase().rpc("company_financial_trend", {
        p_company_id: companyId,
        p_months: months,
      }),
    );
  },

  async getDrillDown(companyId: string, startDate: string, endDate: string, lineKey: string) {
    return callRpc<{ line_key: string; items: DrillDownItem[] }>(() =>
      getSupabase().rpc("company_financial_drill_down", {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_line_key: lineKey,
      }),
    );
  },

  async listEntries(companyId: string, startDate?: string, endDate?: string) {
    return callRpc<{ entries: FinancialEntry[] }>(() =>
      getSupabase().rpc("list_financial_entries", {
        p_company_id: companyId,
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
      }),
    );
  },

  async upsertEntry(
    companyId: string,
    input: {
      id?: string | null;
      entry_type: FinancialEntryType;
      category: string;
      description: string;
      amount: number;
      entry_date: string;
      is_paid?: boolean;
      recurrence?: "none" | "monthly" | "yearly";
      notes?: string | null;
    },
  ) {
    return callRpc<{ id: string }>(() =>
      getSupabase().rpc("upsert_financial_entry", {
        p_company_id: companyId,
        p_entry_id: input.id ?? null,
        p_entry_type: input.entry_type,
        p_category: input.category,
        p_description: input.description,
        p_amount: input.amount,
        p_entry_date: input.entry_date,
        p_is_paid: input.is_paid ?? true,
        p_recurrence: input.recurrence ?? "none",
        p_notes: input.notes ?? null,
      }),
    );
  },

  async deleteEntry(companyId: string, entryId: string) {
    return callRpc<Record<string, never>>(() =>
      getSupabase().rpc("delete_financial_entry", {
        p_company_id: companyId,
        p_entry_id: entryId,
      }),
    );
  },
};

export function formatFinanceMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function exportDreCsv(dre: FinancialDre, companyName = "Salão"): string {
  const lines = dre.lines ?? [];
  const header = ["Empresa", "Período início", "Período fim", "Linha", "Valor (R$)"];
  const rows = lines.map((l) => [
    companyName,
    dre.period?.start ?? "",
    dre.period?.end ?? "",
    l.label,
    Number(l.amount).toFixed(2).replace(".", ","),
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(escape).join(";")).join("\n");
}
