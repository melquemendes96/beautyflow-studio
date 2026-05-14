const STORAGE_KEY = "bf_master_notifications_read_v1";
const MAX_IDS = 400;

export function getReadNotificationIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function addReadNotificationIds(ids: string[]): void {
  if (ids.length === 0) return;
  const cur = getReadNotificationIds();
  for (const id of ids) cur.add(id);
  const trimmed = [...cur].slice(-MAX_IDS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}
