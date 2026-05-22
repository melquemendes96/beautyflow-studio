/**
 * node scripts/appointment-time.test.mjs
 */
import assert from "node:assert/strict";

function formatAppointmentTimeHm(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const plain = s.match(/^(\d{1,2}):(\d{2})/);
  if (plain) return `${String(plain[1]).padStart(2, "0")}:${plain[2]}`;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function formatAppointmentDateYmd(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const head = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (head) return head[1];
  return s.slice(0, 10);
}

assert.equal(formatAppointmentTimeHm("10:00:00"), "10:00");
assert.equal(formatAppointmentTimeHm("10:30"), "10:30");
assert.equal(formatAppointmentTimeHm("1970-01-01T10:00:00.000Z"), "10:00");
assert.equal(formatAppointmentDateYmd("2026-05-26"), "2026-05-26");
assert.equal(formatAppointmentDateYmd("2026-05-26T00:00:00.000Z"), "2026-05-26");

console.log("appointment-time: all tests passed");
