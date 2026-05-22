/**
 * Gera arquivo .ics (iCalendar) para adicionar agendamento ao calendário do dispositivo.
 */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** DTSTART/DTEND local (floating) — YYYY-MM-DD + HH:MM */
export function toIcsLocalDateTime(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const [hh, mm] = hm.split(":").map((x) => Number(x));
  return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function addMinutesToLocalDateTime(ymd: string, hm: string, minutes: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const start = new Date(y, mo - 1, d, hh, mm, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  const ey = end.getFullYear();
  const em = pad2(end.getMonth() + 1);
  const ed = pad2(end.getDate());
  const eh = pad2(end.getHours());
  const emin = pad2(end.getMinutes());
  return `${ey}${em}${ed}T${eh}${emin}00`;
}

export type BuildAppointmentIcsParams = {
  title: string;
  studioName: string;
  dateYmd: string;
  timeHm: string;
  durationMinutes?: number;
  location?: string;
  descriptionLines?: string[];
};

export function buildAppointmentIcs(params: BuildAppointmentIcsParams): string {
  const duration = Math.max(params.durationMinutes ?? 60, 15);
  const dtStart = toIcsLocalDateTime(params.dateYmd, params.timeHm);
  const dtEnd = addMinutesToLocalDateTime(params.dateYmd, params.timeHm, duration);
  const uid = `bf-${params.dateYmd}-${params.timeHm.replace(":", "")}-${Math.random().toString(36).slice(2, 10)}@jmbeautyflow.tech`;
  const now = new Date();
  const dtStamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;

  const description = (params.descriptionLines ?? [])
    .filter(Boolean)
    .map(escapeIcsText)
    .join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JM BeautyFlow//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    `DESCRIPTION:${description || escapeIcsText(`Agendamento em ${params.studioName}`)}`,
  ];

  if (params.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(params.location.trim())}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadAppointmentIcs(filename: string, icsContent: string) {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
