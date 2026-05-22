/**
 * node scripts/calendar-ics.test.mjs
 */
import assert from "node:assert/strict";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIcsLocalDateTime(ymd, hm) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

assert.equal(toIcsLocalDateTime("2026-05-26", "10:00"), "20260526T100000");

const start = new Date(2026, 4, 26, 10, 0, 0);
const end = new Date(start.getTime() + 45 * 60_000);
assert.equal(end.getHours(), 10);
assert.equal(end.getMinutes(), 45);

console.log("calendar-ics: all tests passed");
