import { formatAppointmentTimeHm } from "@/lib/appointment-time";
import type { ScheduleBlockRow } from "@/services/scheduleBlockService";

export type { ScheduleBlockRow };

export type BusinessHours = {
  opening_time?: string | null;
  closing_time?: string | null;
};

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "19:00";

function hm(value: string | null | undefined): string {
  return formatAppointmentTimeHm(value) || DEFAULT_OPEN;
}

/** Meio do expediente (mesma lógica que get_available_slots no Postgres). */
export function businessMidpoint(opening: string, closing: string): string {
  const [oh, om] = hm(opening).split(":").map(Number);
  const [ch, cm] = hm(closing).split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const midMin = Math.floor((openMin + closeMin) / 2);
  const h = Math.floor(midMin / 60);
  const m = midMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function blockInterval(
  block: ScheduleBlockRow,
  hours: BusinessHours,
): { start: string; end: string } | null {
  const open = hm(hours.opening_time ?? DEFAULT_OPEN);
  const close = hm(hours.closing_time ?? DEFAULT_CLOSE);
  const mid = businessMidpoint(open, close);

  switch (block.block_type) {
    case "manual_block": {
      const start = hm(block.time_start);
      const end = hm(block.time_end);
      if (!start || !end) return null;
      return { start, end };
    }
    case "morning_full":
      return { start: open, end: mid };
    case "afternoon_full":
      return { start: mid, end: close };
    case "day_full":
      return { start: open, end: close };
    default:
      return null;
  }
}

/** Bloqueios que afetam a visualização da agenda (studio + prestador em foco). */
export function blocksForAgendaScope(
  blocks: ScheduleBlockRow[],
  scopeProviderId: string | null,
): ScheduleBlockRow[] {
  return blocks.filter((b) => b.provider_id == null || b.provider_id === scopeProviderId);
}

/** Horário cheio (ex.: 10:00) está dentro do bloqueio? */
export function isHourBlocked(
  hourHm: string,
  blocks: ScheduleBlockRow[],
  hours: BusinessHours,
): boolean {
  const slot = hm(hourHm);
  return blocks.some((b) => {
    const interval = blockInterval(b, hours);
    if (!interval) return false;
    return slot >= interval.start && slot < interval.end;
  });
}

export function findManualBlockForHour(
  blocks: ScheduleBlockRow[],
  hourHm: string,
  scopeProviderId: string | null,
): ScheduleBlockRow | null {
  const slot = hm(hourHm);
  return (
    blocks.find((b) => {
      if (b.block_type !== "manual_block") return false;
      if ((b.provider_id ?? null) !== scopeProviderId) return false;
      return hm(b.time_start) === slot;
    }) ?? null
  );
}

/** Fim do slot de 1h (10:00 → 11:00). */
export function hourSlotEnd(hourHm: string): string {
  const [h, m] = hm(hourHm).split(":").map(Number);
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hasBlockType(
  blocks: ScheduleBlockRow[],
  blockType: string,
  scopeProviderId: string | null,
): boolean {
  return blocks.some((b) => b.block_type === blockType && (b.provider_id ?? null) === scopeProviderId);
}

export function blockScopeLabel(scopeProviderId: string | null, providerName?: string | null): string {
  if (scopeProviderId && providerName) return providerName;
  if (scopeProviderId) return "prestador selecionado";
  return "studio inteiro";
}

/** Primeiro bloqueio que cobre o horário (para rótulo na agenda do dono). */
export function findCoveringBlockForHour(
  blocks: ScheduleBlockRow[],
  hourHm: string,
  hours: BusinessHours,
): ScheduleBlockRow | null {
  const slot = hm(hourHm);
  for (const b of blocks) {
    const interval = blockInterval(b, hours);
    if (!interval) continue;
    if (slot >= interval.start && slot < interval.end) return b;
  }
  return null;
}
