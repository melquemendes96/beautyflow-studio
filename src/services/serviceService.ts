import { getSupabase } from "@/lib/supabaseClient";

/**
 * Catálogo de serviços oferecidos pela empresa (`services` + `company_id`).
 */
export const serviceService = {
  listActiveByCompany(companyId: string) {
    return getSupabase()
      .from("services")
      .select("*")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name");
  },

  listByCompany(companyId: string) {
    return getSupabase()
      .from("services")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
  },

  create(
    companyId: string,
    input: {
      name: string;
      description?: string | null;
      price: number;
      duration_minutes: number;
      buffer_minutes?: number;
      image_url?: string | null;
      active?: boolean;
      category?: string | null;
      service_kind?: "single" | "package";
      package_sessions?: number | null;
      package_allowed_dow?: number[] | null;
      package_max_per_week?: number | null;
      package_valid_days?: number | null;
    },
  ) {
    return getSupabase()
      .from("services")
      .insert({
        company_id: companyId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        duration_minutes: input.duration_minutes,
        buffer_minutes: input.buffer_minutes ?? 0,
        image_url: input.image_url ?? null,
        active: input.active ?? true,
        category: input.category ?? null,
        service_kind: input.service_kind ?? "single",
        package_sessions: input.package_sessions ?? null,
        package_allowed_dow: input.package_allowed_dow ?? null,
        package_max_per_week: input.package_max_per_week ?? null,
        package_valid_days: input.package_valid_days ?? null,
      })
      .select("*")
      .single();
  },

  update(
    companyId: string,
    serviceId: string,
    patch: Partial<{
      name: string;
      description: string | null;
      price: number;
      duration_minutes: number;
      buffer_minutes: number;
      image_url: string | null;
      active: boolean;
      category: string | null;
      service_kind: "single" | "package";
      package_sessions: number | null;
      package_allowed_dow: number[] | null;
      package_max_per_week: number | null;
      package_valid_days: number | null;
    }>,
  ) {
    return getSupabase()
      .from("services")
      .update(patch)
      .eq("company_id", companyId)
      .eq("id", serviceId)
      .select("*")
      .single();
  },

  listByCompanyWithPrices(companyId: string) {
    return getSupabase()
      .from("services")
      .select("id,name,price")
      .eq("company_id", companyId)
      .order("name");
  },
};
