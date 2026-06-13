import { getSupabase } from "@/lib/supabaseClient";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";
import type { PaymentMethod } from "@/services/tabService";

export type CashRegisterSession = {
  id: string;
  opened_at: string;
  status: string;
  opening_float: number;
  expected_by_method: Record<string, number>;
  sales_dinheiro?: number;
  expected_dinheiro_total?: number;
  closed_tabs: number;
};

export type CashCountInput = {
  payment_method: PaymentMethod | string;
  counted_amount: number;
};

export type CashCloseResult = {
  session_id: string;
  total_variance: number;
};

function parseRpc<T>(res: { data: unknown; error: unknown }, fallback = "Operação indisponível.") {
  if (res.error) throw new Error(formatSupabaseApiError(res.error, fallback));
  const payload = res.data as { ok?: boolean; error?: string; message?: string } | null;
  if (!payload || payload.ok === false) {
    const labels: Record<string, string> = {
      caixa_ja_aberto: "Já existe um caixa aberto.",
      sessao_invalida: "Sessão de caixa inválida ou já fechada.",
    };
    throw new Error(labels[payload?.error ?? ""] ?? formatSupabaseApiError(payload?.error ?? payload?.message ?? fallback, fallback));
  }
  return payload as T & { ok: true };
}

export function cashExpectedForMethod(session: CashRegisterSession, method: string): number {
  const sales = Number(session.expected_by_method?.[method] ?? 0);
  if (method === "dinheiro") {
    return Number(session.opening_float ?? 0) + sales;
  }
  return sales;
}

export const cashService = {
  async getStatus(companyId: string) {
    const res = await getSupabase().rpc("get_cash_register_status", { p_company_id: companyId });
    const payload = parseRpc<{ session: CashRegisterSession | null }>(res);
    return payload.session;
  },

  async openSession(companyId: string, openingFloat = 0) {
    const res = await getSupabase().rpc("open_cash_register_session", {
      p_company_id: companyId,
      p_opening_float: openingFloat,
    });
    return parseRpc<{ session_id: string; opening_float: number }>(res);
  },

  async closeSession(companyId: string, sessionId: string, counts: CashCountInput[], notes?: string) {
    const res = await getSupabase().rpc("close_cash_register_session", {
      p_company_id: companyId,
      p_session_id: sessionId,
      p_counts: counts,
      p_notes: notes ?? null,
    });
    return parseRpc<CashCloseResult>(res);
  },
};
