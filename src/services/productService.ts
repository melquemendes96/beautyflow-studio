import { getSupabase } from "@/lib/supabaseClient";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";

export type ProductRow = {
  id: string;
  name: string;
  sku?: string | null;
  sale_price: number;
  cost_price: number;
  stock_quantity: number;
  min_stock_quantity: number;
  commission_pct?: number | null;
  is_consumable: boolean;
  track_stock: boolean;
  active: boolean;
  low_stock?: boolean;
};

export type ServiceConsumableRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity_per_service: number;
  stock_quantity: number;
};

function parseRpc<T>(res: { data: unknown; error: unknown }, fallback = "Operação indisponível.") {
  if (res.error) throw new Error(formatSupabaseApiError(res.error, fallback));
  const payload = res.data as { ok?: boolean; error?: string } | null;
  if (!payload || payload.ok === false) {
    throw new Error(formatSupabaseApiError(payload?.error ?? fallback, fallback));
  }
  return payload as T & { ok: true };
}

export const productService = {
  async list(companyId: string) {
    const res = await getSupabase().rpc("admin_list_products", { p_company_id: companyId });
    const payload = parseRpc<{ products: ProductRow[] }>(res);
    return payload.products ?? [];
  },

  async upsert(
    companyId: string,
    input: {
      id?: string | null;
      name: string;
      sku?: string | null;
      sale_price: number;
      cost_price: number;
      min_stock_quantity: number;
      commission_pct?: number | null;
      is_consumable: boolean;
      track_stock: boolean;
      active: boolean;
    },
  ) {
    const res = await getSupabase().rpc("admin_upsert_product", {
      p_company_id: companyId,
      p_product_id: input.id ?? null,
      p_name: input.name,
      p_sku: input.sku ?? null,
      p_sale_price: input.sale_price,
      p_cost_price: input.cost_price,
      p_min_stock_quantity: input.min_stock_quantity,
      p_commission_pct: input.commission_pct ?? null,
      p_is_consumable: input.is_consumable,
      p_track_stock: input.track_stock,
      p_active: input.active,
    });
    return parseRpc<{ product_id: string }>(res);
  },

  async adjustStock(companyId: string, productId: string, quantityDelta: number, notes?: string) {
    const res = await getSupabase().rpc("admin_adjust_product_stock", {
      p_company_id: companyId,
      p_product_id: productId,
      p_quantity_delta: quantityDelta,
      p_notes: notes ?? null,
    });
    return parseRpc(res);
  },

  async listServiceConsumables(companyId: string, serviceId: string) {
    const res = await getSupabase().rpc("admin_list_service_consumables", {
      p_company_id: companyId,
      p_service_id: serviceId,
    });
    const payload = parseRpc<{ items: ServiceConsumableRow[] }>(res);
    return payload.items ?? [];
  },

  async upsertServiceConsumable(
    companyId: string,
    serviceId: string,
    productId: string,
    quantityPerService: number,
  ) {
    const res = await getSupabase().rpc("admin_upsert_service_consumable", {
      p_company_id: companyId,
      p_service_id: serviceId,
      p_product_id: productId,
      p_quantity_per_service: quantityPerService,
    });
    return parseRpc(res);
  },

  async deleteServiceConsumable(companyId: string, consumableId: string) {
    const res = await getSupabase().rpc("admin_delete_service_consumable", {
      p_company_id: companyId,
      p_consumable_id: consumableId,
    });
    return parseRpc(res);
  },
};
