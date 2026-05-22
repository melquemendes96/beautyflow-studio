/**
 * Normaliza campos date/time vindos do PostgREST (DATE, TIME, timestamptz serializados).
 * Agenda admin e booking público devem usar os mesmos helpers.
 */

export function formatAppointmentTimeHm(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const plain = s.match(/^(\d{1,2}):(\d{2})/);
  if (plain) return `${String(plain[1]).padStart(2, "0")}:${plain[2]}`;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function formatAppointmentDateYmd(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const head = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (head) return head[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return head?.[1] ?? s.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function compareAppointmentTime(a: unknown, b: unknown): number {
  return formatAppointmentTimeHm(a).localeCompare(formatAppointmentTimeHm(b));
}

export type PublicBookingRpcResult = {
  ok: boolean;
  error?: string;
  appointment_id?: string;
  client_id?: string;
};

export function parsePublicBookingRpcResult(data: unknown): PublicBookingRpcResult {
  if (data == null) return { ok: false, error: "resposta_vazia" };
  let raw: Record<string, unknown>;
  if (typeof data === "string") {
    try {
      raw = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "resposta_invalida" };
    }
  } else if (typeof data === "object" && !Array.isArray(data)) {
    raw = data as Record<string, unknown>;
  } else {
    return { ok: false, error: "resposta_invalida" };
  }
  const ok = raw.ok === true;
  return {
    ok,
    error: typeof raw.error === "string" ? raw.error : undefined,
    appointment_id: typeof raw.appointment_id === "string" ? raw.appointment_id : undefined,
    client_id: typeof raw.client_id === "string" ? raw.client_id : undefined,
  };
}

export function clientContactLine(client: { whatsapp?: string | null; email?: string | null } | null | undefined): string {
  if (!client) return "—";
  const w = (client.whatsapp ?? "").trim();
  const e = (client.email ?? "").trim();
  if (w && e) return `${w} · ${e}`;
  return w || e || "—";
}
