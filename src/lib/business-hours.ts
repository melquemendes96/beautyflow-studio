/** Dias da semana no padrão business_settings: Seg=0 … Dom=6 (ISO dow − 1). */
export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export const DEFAULT_WORKING_DAYS: boolean[] = [true, true, true, true, true, true, false];
export const DEFAULT_OPENING_TIME = "09:00";
export const DEFAULT_CLOSING_TIME = "19:00";

/** Opções de horário de 00:00 a 23:45 (passo 15 min) + 23:59. */
export function buildTimeSelectOptions(stepMinutes = 15): string[] {
  const step = Math.max(1, Math.min(60, stepMinutes));
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    out.push(fromMinutes(m));
  }
  if (!out.includes("23:59")) out.push("23:59");
  return out;
}

export function normalizeTimeHm(value: unknown, fallback = DEFAULT_OPENING_TIME): string {
  if (value == null || value === "") return fallback;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function normalizeWorkingDays(value: unknown): boolean[] {
  if (!Array.isArray(value) || value.length !== 7) return DEFAULT_WORKING_DAYS.slice();
  return value.map((v) => Boolean(v));
}

export function toMinutes(hm: string): number {
  const [h, m] = normalizeTimeHm(hm).split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Texto amigável: "09h" ou "09h30". */
export function formatHoursLabel(hm: string): string {
  const t = normalizeTimeHm(hm);
  const [h, m] = t.split(":");
  if (m === "00") return `${Number(h)}h`;
  return `${Number(h)}h${m}`;
}

/** Comprime dias ativos: "Seg–Sáb", "Seg, Qua, Sex", "Dom". */
export function formatWorkingDaysRange(workingDays: boolean[]): string {
  const days = normalizeWorkingDays(workingDays);
  const activeIdx = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  if (activeIdx.length === 0) return "Fechado";
  if (activeIdx.length === 7) return "Todos os dias";

  const ranges: string[] = [];
  let start = activeIdx[0]!;
  let prev = start;
  for (let i = 1; i <= activeIdx.length; i++) {
    const cur = activeIdx[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(
      start === prev
        ? WEEKDAY_LABELS[start]!
        : prev === start + 1
          ? `${WEEKDAY_LABELS[start]}, ${WEEKDAY_LABELS[prev]}`
          : `${WEEKDAY_LABELS[start]}–${WEEKDAY_LABELS[prev]}`,
    );
    if (cur == null) break;
    start = cur;
    prev = cur;
  }
  return ranges.join(", ");
}

/** Texto da página pública a partir dos dias/horários estruturados. */
export function formatPublicHoursText(
  workingDays: boolean[],
  openingTime: string,
  closingTime: string,
): string {
  const range = formatWorkingDaysRange(workingDays);
  if (range === "Fechado") return "Fechado";
  const open = formatHoursLabel(openingTime);
  const close = formatHoursLabel(closingTime);
  return `${range} · ${open} às ${close}`;
}

/**
 * Slots horários da agenda admin entre abertura e fechamento.
 * Inclui o horário de abertura e cada hora cheia até antes do fechamento.
 */
export function buildAgendaHourSlots(openingTime: string, closingTime: string): string[] {
  const openM = toMinutes(normalizeTimeHm(openingTime, DEFAULT_OPENING_TIME));
  const closeM = toMinutes(normalizeTimeHm(closingTime, DEFAULT_CLOSING_TIME));
  if (!(closeM > openM)) return [];

  const out: string[] = [];
  out.push(fromMinutes(openM));
  let m = Math.ceil((openM + 1) / 60) * 60;
  while (m < closeM) {
    out.push(fromMinutes(m));
    m += 60;
  }
  return out;
}

/** JS getDay(): Dom=0…Sáb=6 → índice business_settings Seg=0…Dom=6. */
export function jsWeekdayToBusinessIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function isWorkingDate(date: Date, workingDays: boolean[]): boolean {
  const days = normalizeWorkingDays(workingDays);
  return Boolean(days[jsWeekdayToBusinessIndex(date.getDay())]);
}
