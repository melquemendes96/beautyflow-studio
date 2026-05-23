import { getSupabase } from "@/lib/supabaseClient";

export type ScheduleBlockType = "manual_block" | "morning_full" | "afternoon_full" | "day_full";

/**
 * Bloqueios de agenda (`schedule_blocks` + `company_id`).
 *
 * Regra do banco: só `manual_block` pode ter time_start/time_end;
 * morning_full | afternoon_full | day_full devem ter times NULL.
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

  create(companyId: string, input: { block_date: string; block_type: ScheduleBlockType; time_start?: string; time_end?: string }) {
    const isManual = input.block_type === "manual_block";
    return getSupabase()
      .from("schedule_blocks")
      .insert({
        company_id: companyId,
        block_date: input.block_date,
        block_type: input.block_type,
        time_start: isManual ? input.time_start ?? null : null,
        time_end: isManual ? input.time_end ?? null : null,
      })
      .select("*")
      .single();
  },

  delete(companyId: string, blockId: string) {
    return getSupabase().from("schedule_blocks").delete().eq("company_id", companyId).eq("id", blockId);
  },

  deleteByType(companyId: string, blockDate: string, blockType: ScheduleBlockType) {
    return getSupabase()
      .from("schedule_blocks")
      .delete()
      .eq("company_id", companyId)
      .eq("block_date", blockDate)
      .eq("block_type", blockType);
  },
};
