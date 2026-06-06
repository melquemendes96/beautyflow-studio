import { getSupabase } from "@/lib/supabaseClient";

export type ScheduleBlockType = "manual_block" | "morning_full" | "afternoon_full" | "day_full";

export type ScheduleBlockRow = {
  id?: string;
  block_type: string;
  time_start?: string | null;
  time_end?: string | null;
  provider_id?: string | null;
  provider?: { display_name?: string | null; color?: string | null } | null;
};

/**
 * Bloqueios de agenda (`schedule_blocks` + `company_id`).
 * `provider_id` null = bloqueio do studio inteiro; preenchido = só aquele prestador.
 */
export const scheduleBlockService = {
  listByCompanyAndDate(companyId: string, date: string) {
    return getSupabase()
      .from("schedule_blocks")
      .select("*, provider:service_providers(display_name, color)")
      .eq("company_id", companyId)
      .eq("block_date", date)
      .order("time_start");
  },

  create(
    companyId: string,
    input: {
      block_date: string;
      block_type: ScheduleBlockType;
      time_start?: string;
      time_end?: string;
      provider_id?: string | null;
    },
  ) {
    const isManual = input.block_type === "manual_block";
    return getSupabase()
      .from("schedule_blocks")
      .insert({
        company_id: companyId,
        block_date: input.block_date,
        block_type: input.block_type,
        time_start: isManual ? input.time_start ?? null : null,
        time_end: isManual ? input.time_end ?? null : null,
        provider_id: input.provider_id ?? null,
      })
      .select("*, provider:service_providers(display_name, color)")
      .single();
  },

  delete(companyId: string, blockId: string) {
    return getSupabase().from("schedule_blocks").delete().eq("company_id", companyId).eq("id", blockId);
  },

  deleteByType(companyId: string, blockDate: string, blockType: ScheduleBlockType, providerId?: string | null) {
    let query = getSupabase()
      .from("schedule_blocks")
      .delete()
      .eq("company_id", companyId)
      .eq("block_date", blockDate)
      .eq("block_type", blockType);

    if (providerId === undefined) {
      query = query.is("provider_id", null);
    } else if (providerId === null) {
      query = query.is("provider_id", null);
    } else {
      query = query.eq("provider_id", providerId);
    }

    return query;
  },
};
