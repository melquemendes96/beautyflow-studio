import { getSupabase } from "@/lib/supabaseClient";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";

export type ClientTabLine = {
  id: string;
  line_type: string;
  service_id?: string | null;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  seller_type?: string | null;
  seller_provider_id?: string | null;
};

export type ClientTabDetail = {
  tab: {
    id: string;
    company_id: string;
    appointment_id: string;
    client_id: string;
    provider_id?: string | null;
    status: string;
    subtotal: number;
    total: number;
    payment_method?: string | null;
    closed_at?: string | null;
    product_sales_total?: number;
    product_commission_total?: number;
  };
  lines: ClientTabLine[];
  appointment: {
    id: string;
    status: string;
    appointment_date: string;
    appointment_time: string;
    client_package_id?: string | null;
    package_session_number?: number | null;
  };
  client: {
    id: string;
    name: string;
    whatsapp?: string | null;
  };
  package_remaining?: number | null;
  package_pending_payment?: boolean;
  inventory_enabled?: boolean;
};

export type ClientTabListRow = {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  payment_method?: string | null;
  closed_at?: string | null;
  appointment_id: string;
  appointment_status: string;
  appointment_time: string;
  client_package_id?: string | null;
  client_name: string;
  client_whatsapp?: string | null;
  service_name: string;
  provider_name?: string | null;
};

export type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "outro";

export type PackageResolution = "confirm" | "avulso";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao_credito", label: "Cartão crédito" },
  { value: "cartao_debito", label: "Cartão débito" },
  { value: "outro", label: "Outro" },
];

const TAB_ERROR_LABELS: Record<string, string> = {
  agendamento_invalido: "Agendamento inválido para fechamento.",
  agendamento_cancelado: "Agendamento cancelado — não é possível fechar a comanda.",
  aguardando_pagamento_salao: "Confirme o pagamento do pacote antes de fechar.",
  comanda_nao_encontrada: "Comanda não encontrada.",
  comanda_nao_aberta: "Esta comanda já foi fechada.",
  forbidden: "Sem permissão para esta ação.",
  pacote_invalido: "Pacote inválido ou esgotado.",
  pacote_esgotado: "Pacote sem sessões disponíveis.",
  resolucao_pacote_invalida: "Resolução de pacote inválida.",
  servico_avulso_obrigatorio: "Selecione o serviço avulso que a cliente recebeu.",
  servico_avulso_invalido: "Escolha um serviço avulso (não pacote).",
  servico_nao_encontrado: "Serviço não encontrado.",
  forma_pagamento_invalida: "Selecione uma forma de pagamento válida.",
  caixa_fechado: "Abra o caixa do dia antes de fechar comandas.",
  estoque_insuficiente: "Estoque insuficiente para um ou mais produtos.",
  estoque_insumo_insuficiente: "Estoque insuficiente de insumos do serviço.",
  feature_indisponivel: "Recurso de produtos não disponível no seu plano.",
  linha_nao_encontrada: "Item da comanda não encontrado.",
  nao_pode_remover_servico: "Não é possível remover a linha de serviço.",
  produto_nao_encontrado: "Produto não encontrado.",
};

export function formatTabError(error: unknown, fallback = "Não foi possível concluir a operação."): string {
  if (typeof error === "string" && TAB_ERROR_LABELS[error]) return TAB_ERROR_LABELS[error];
  const msg = formatSupabaseApiError(error);
  if (TAB_ERROR_LABELS[msg]) return TAB_ERROR_LABELS[msg];
  return msg || fallback;
}

export function formatTabMoney(value: number) {
  return `R$ ${Number(value ?? 0).toFixed(2).replace(".", ",")}`;
}

export const tabService = {
  async getForAppointment(appointmentId: string) {
    const res = await getSupabase().rpc("get_client_tab_for_appointment", {
      p_appointment_id: appointmentId,
    });
    if (res.error) {
      return { ...res, data: null as ClientTabDetail | null };
    }
    const payload = res.data as ({ ok?: boolean; error?: string } & Partial<ClientTabDetail>) | null;
    if (!payload || payload.ok === false) {
      return {
        ...res,
        data: null as ClientTabDetail | null,
        error: payload?.error ?? "comanda_nao_encontrada",
      };
    }
    const detail: ClientTabDetail = {
      tab: payload.tab!,
      lines: (payload.lines ?? []) as ClientTabLine[],
      appointment: payload.appointment!,
      client: payload.client!,
      package_remaining: payload.package_remaining,
      package_pending_payment: payload.package_pending_payment,
      inventory_enabled: payload.inventory_enabled,
    };
    return { ...res, data: detail, error: null };
  },

  async listForDate(companyId: string, date: string) {
    const res = await getSupabase().rpc("list_client_tabs_for_date", {
      p_company_id: companyId,
      p_date: date,
    });
    const payload = res.data as { ok?: boolean; tabs?: ClientTabListRow[]; error?: string } | null;
    if (payload?.ok === false) {
      return { ...res, data: [] as ClientTabListRow[], error: payload.error };
    }
    return { ...res, data: payload?.tabs ?? [] };
  },

  closeTab(
    companyId: string,
    tabId: string,
    paymentMethod: PaymentMethod,
    packageResolution?: PackageResolution | null,
    singleServiceId?: string | null,
  ) {
    return getSupabase().rpc("close_client_tab", {
      p_company_id: companyId,
      p_tab_id: tabId,
      p_payment_method: paymentMethod,
      p_package_resolution: packageResolution ?? null,
      p_single_service_id: singleServiceId ?? null,
    });
  },

  transferProvider(companyId: string, appointmentId: string, newProviderId: string) {
    return getSupabase().rpc("transfer_tab_provider", {
      p_company_id: companyId,
      p_appointment_id: appointmentId,
      p_new_provider_id: newProviderId,
    });
  },

  addProductLine(
    companyId: string,
    tabId: string,
    productId: string,
    quantity = 1,
    sellerProviderId?: string | null,
  ) {
    return getSupabase().rpc("add_client_tab_product_line", {
      p_company_id: companyId,
      p_tab_id: tabId,
      p_product_id: productId,
      p_quantity: quantity,
      p_seller_provider_id: sellerProviderId ?? null,
    });
  },

  removeLine(companyId: string, lineId: string) {
    return getSupabase().rpc("remove_client_tab_line", {
      p_company_id: companyId,
      p_line_id: lineId,
    });
  },
};
