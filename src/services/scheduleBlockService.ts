import { getSupabase } from "@/lib/supabaseClient";

/**
 * Bloqueios de agenda (`schedule_blocks` + `company_id`).
 *
 * Tipos (Fase 2): manual_block | morning_full | afternoon_full | day_full
 */
export const scheduleBlockService = {
  listByCompanyAndDate(companyId: string, date: string) {
    return getSupabase()
      .from("schedule_blocks")
      .select("*")
      .eq("company_id", companyId)
      .eq("block_date", date)
      .order("time_start");
  },

  create(
    companyId: string,
    input: { block_date: string; time_start: string; time_end: string; block_type: string },
  ) {
    return getSupabase()
      .from("schedule_blocks")
      .insert({
        company_id: companyId,
        block_date: input.block_date,
        time_start: input.time_start,
        time_end: input.time_end,
        block_type: input.block_type,
      })
      .select("*")
      .single();
  },
};

