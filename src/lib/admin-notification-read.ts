const PREFIX = "bf_admin_notif_read_";
const MAX_IDS = 400;

export function getReadAdminNotificationIds(companyId: string): Set<string> {
  if (!companyId) return new Set();
  try {
    const raw = localStorage.getItem(PREFIX + companyId);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function addReadAdminNotificationIds(companyId: string, ids: string[]): void {
  if (!companyId || ids.length === 0) return;
  const cur = getReadAdminNotificationIds(companyId);
  for (const id of ids) cur.add(id);
  const trimmed = [...cur].slice(-MAX_IDS);
  localStorage.setItem(PREFIX + companyId, JSON.stringify(trimmed));
}
