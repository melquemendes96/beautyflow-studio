import { DEMO_SHOWCASE, toYmd, type DemoService } from "@/lib/demo-showcase-data";

export type { DemoService };

export type DemoOccupiedSlot = {
  start: string;
  duration_minutes: number;
};

/** Agendamentos fictícios do dia (demonstração). */
export const DEMO_MOCK_OCCUPIED: DemoOccupiedSlot[] = [
  { start: "10:00", duration_minutes: 60 },
  { start: "14:00", duration_minutes: 30 },
];

const DAY_OPEN_MINUTES = 9 * 60;
const DAY_CLOSE_MINUTES = 19 * 60;
const SLOT_STEP_MINUTES = 30;

export function parseTimeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generateDemoTimeSlots() {
  const slots: string[] = [];
  for (let m = DAY_OPEN_MINUTES; m < DAY_CLOSE_MINUTES; m += SLOT_STEP_MINUTES) {
    slots.push(formatMinutesToTime(m));
  }
  return slots;
}

export function getSelectedServices(serviceIds: string[], services: DemoService[] = DEMO_SHOWCASE.services) {
  return services.filter((s) => serviceIds.includes(s.id));
}

export function getTotalDurationMinutes(
  serviceIds: string[],
  services: DemoService[] = DEMO_SHOWCASE.services,
) {
  return getSelectedServices(serviceIds, services).reduce((sum, s) => sum + s.duration_minutes, 0);
}

export function getTotalPrice(serviceIds: string[], services: DemoService[] = DEMO_SHOWCASE.services) {
  return getSelectedServices(serviceIds, services).reduce((sum, s) => sum + s.price, 0);
}

export function getOccupiedIntervals() {
  return DEMO_MOCK_OCCUPIED.map((b) => ({
    start: parseTimeToMinutes(b.start),
    end: parseTimeToMinutes(b.start) + b.duration_minutes,
  }));
}

export function getBookingEndMinutes(startTime: string, totalDurationMinutes: number) {
  return parseTimeToMinutes(startTime) + totalDurationMinutes;
}

/** Verifica se o bloco [início, início + duração) cabe no expediente e não conflita. */
export function checkDemoSlotAvailability(startTime: string, totalDurationMinutes: number) {
  if (totalDurationMinutes <= 0) {
    return { ok: false, reason: "Selecione ao menos um serviço." as const };
  }

  const start = parseTimeToMinutes(startTime);
  const end = start + totalDurationMinutes;

  if (start < DAY_OPEN_MINUTES) {
    return { ok: false, reason: "before_open" as const };
  }
  if (end > DAY_CLOSE_MINUTES) {
    return { ok: false, reason: "after_close" as const };
  }

  for (const occupied of getOccupiedIntervals()) {
    if (start < occupied.end && end > occupied.start) {
      return {
        ok: false,
        reason: "conflict" as const,
        conflictAt: formatMinutesToTime(occupied.start),
      };
    }
  }

  return { ok: true as const };
}

export function getDemoSlotUnavailabilityReason(
  startTime: string,
  totalDurationMinutes: number,
  serviceCount: number,
) {
  const check = checkDemoSlotAvailability(startTime, totalDurationMinutes);
  if (check.ok) return null;

  const durationLabel =
    totalDurationMinutes >= 60
      ? `${Math.floor(totalDurationMinutes / 60)}h${totalDurationMinutes % 60 ? ` ${totalDurationMinutes % 60}min` : ""}`
      : `${totalDurationMinutes} min`;

  if (check.reason === "conflict") {
    return `Não é possível agendar às ${startTime}. Com ${serviceCount} serviço(s) (${durationLabel}), o horário conflita com outro agendamento às ${check.conflictAt}.`;
  }
  if (check.reason === "after_close") {
    return `Não é possível agendar às ${startTime}. A duração total (${durationLabel}) ultrapassa o horário de fechamento.`;
  }
  if (check.reason === "before_open") {
    return `Não é possível agendar às ${startTime}. O estúdio abre às 09h.`;
  }
  return "Horário indisponível para esta combinação de serviços.";
}

export function isDemoSlotSelectable(startTime: string, totalDurationMinutes: number) {
  return checkDemoSlotAvailability(startTime, totalDurationMinutes).ok;
}

export function buildMonthCalendarCells(year: number, month: number) {
  const today = new Date();
  const todayYmd = toYmd(today);
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();

  const cells: Array<
    | { type: "empty" }
    | { type: "day"; day: number; ymd: string; isPast: boolean; isToday: boolean }
  > = [];

  for (let i = 0; i < startPad; i++) cells.push({ type: "empty" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const ymd = toYmd(dt);
    const isPast = dt < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    cells.push({ type: "day", day: d, ymd, isPast, isToday: ymd === todayYmd });
  }
  return cells;
}

export function getMonthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function canNavigateDemoMonth(year: number, month: number, direction: -1 | 1) {
  const today = new Date();
  const min = today.getFullYear() * 12 + today.getMonth();
  const max = min + 2;
  const next = year * 12 + month + direction;
  return next >= min && next <= max;
}

export const DEMO_TIME_SLOTS = generateDemoTimeSlots();
