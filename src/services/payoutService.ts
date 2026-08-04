import { getSupabase } from "@/lib/supabaseClient";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";
import type { PaymentMethod } from "@/services/tabService";

export type ProviderCommissionBalance = {
  service_commission: number;
  product_commission: number;
  total_commission: number;
  paid: number;
  pending?: number;
  balance: number;
  start_date: string;
  end_date: string;
};

export type ProviderPayoutRow = {
  id: string;
  provider_id: string;
  provider_name: string;
  amount: number;
  service_commission: number;
  product_commission: number;
  period_start: string;
  period_end: string;
  status: string;
  payment_method?: string | null;
  paid_at?: string | null;
  notes?: string | null;
};

export type PayoutRpcResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message?: string };

function mapRpcError(error: unknown, fallback = "Operação indisponível."): PayoutRpcResult<never> {
  const msg = formatSupabaseApiError(error, fallback);
  if (msg.includes("PGRST202") || msg.includes("Could not find the function")) {
    return {
      ok: false,
      error: "rpc_ausente",
      message:
        "Funções de repasse ainda não aplicadas no Supabase. Execute supabase/scripts/apply_comandas_phases_345_full.sql e, em seguida, 20260613000002_fix_provider_payouts_balance.sql.",
    };
  }
  return { ok: false, error: msg, message: msg };
}

function parsePayload<T extends Record<string, unknown>>(
  data: unknown,
  fallback = "Operação indisponível.",
): PayoutRpcResult<T> {
  const payload = data as ({ ok?: boolean; error?: string; message?: string } & T) | null;
  if (!payload || payload.ok === false) {
    const code = payload?.error ?? fallback;
    const labels: Record<string, string> = {
      forbidden: "Sem permissão para ver repasses.",
      saldo_zero: "Não há saldo de comissão disponível neste período.",
      repasse_pendente_existente:
        "Já existe repasse pendente para este prestador. Marque como pago ou cancele antes de gerar outro.",
      periodo_invalido: "Período inválido — a data inicial deve ser anterior ou igual à final.",
      repasse_nao_encontrado: "Repasse não encontrado ou já processado.",
      dados_incompletos: "Dados incompletos.",
    };
    return {
      ok: false,
      error: code,
      message: payload?.message ?? labels[code] ?? formatSupabaseApiError(code, fallback),
    };
  }
  return payload as PayoutRpcResult<T> & { ok: true };
}

async function callRpc<T extends Record<string, unknown>>(
  fn: () => Promise<{ data: unknown; error: unknown }>,
): Promise<PayoutRpcResult<T>> {
  const res = await fn();
  if (res.error) return mapRpcError(res.error);
  return parsePayload<T>(res.data);
}

export const payoutService = {
  getBalance(companyId: string, providerId: string, startDate?: string, endDate?: string) {
    return callRpc<ProviderCommissionBalance>(() =>
      getSupabase().rpc("provider_commission_balance", {
        p_company_id: companyId,
        p_provider_id: providerId,
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
      }),
    );
  },

  createPayout(
    companyId: string,
    providerId: string,
    startDate: string,
    endDate: string,
    notes?: string,
  ) {
    return callRpc<{ payout_id: string; amount: number }>(() =>
      getSupabase().rpc("create_provider_payout", {
        p_company_id: companyId,
        p_provider_id: providerId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_notes: notes ?? null,
      }),
    );
  },

  async listPayouts(companyId: string, providerId?: string | null) {
    const res = await callRpc<{ payouts: ProviderPayoutRow[] }>(() =>
      getSupabase().rpc("list_provider_payouts", {
        p_company_id: companyId,
        p_provider_id: providerId ?? null,
      }),
    );
    if (!res.ok) return res;
    return { ok: true as const, payouts: Array.isArray(res.payouts) ? res.payouts : [] };
  },

  markPaid(companyId: string, payoutId: string, paymentMethod: PaymentMethod = "pix") {
    return callRpc<Record<string, never>>(() =>
      getSupabase().rpc("mark_provider_payout_paid", {
        p_company_id: companyId,
        p_payout_id: payoutId,
        p_payment_method: paymentMethod,
      }),
    );
  },

  cancelPayout(companyId: string, payoutId: string) {
    return callRpc<Record<string, never>>(() =>
      getSupabase().rpc("cancel_provider_payout", {
        p_company_id: companyId,
        p_payout_id: payoutId,
      }),
    );
  },
};
