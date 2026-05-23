/**
 * node scripts/admin-agenda-blocks.test.mjs
 */
import assert from "node:assert/strict";

function hm(value) {
  const s = String(value ?? "").trim();
  const plain = s.match(/^(\d{1,2}):(\d{2})/);
  if (plain) return `${String(plain[1]).padStart(2, "0")}:${plain[2]}`;
  return "09:00";
}

function businessMidpoint(opening, closing) {
  const [oh, om] = hm(opening).split(":").map(Number);
  const [ch, cm] = hm(closing).split(":").map(Number);
  const midMin = Math.floor((oh * 60 + om + ch * 60 + cm) / 2);
  return `${String(Math.floor(midMin / 60)).padStart(2, "0")}:${String(midMin % 60).padStart(2, "0")}`;
}

function isHourBlocked(hourHm, blocks, hours) {
  const open = hm(hours.opening_time);
  const close = hm(hours.closing_time);
  const mid = businessMidpoint(open, close);
  const slot = hm(hourHm);
  return blocks.some((b) => {
    let start;
    let end;
    if (b.block_type === "morning_full") {
      start = open;
      end = mid;
    } else if (b.block_type === "manual_block") {
      start = hm(b.time_start);
      end = hm(b.time_end);
    } else return false;
    return slot >= start && slot < end;
  });
}

const hours = { opening_time: "09:00", closing_time: "19:00" };
const mid = businessMidpoint("09:00", "19:00");
assert.equal(mid, "14:00");

assert.equal(isHourBlocked("10:00", [{ block_type: "morning_full" }], hours), true);
assert.equal(isHourBlocked("15:00", [{ block_type: "morning_full" }], hours), false);
assert.equal(
  isHourBlocked("10:00", [{ block_type: "manual_block", time_start: "10:00", time_end: "11:00" }],
  hours,
  ),
  true,
);

console.log("admin-agenda-blocks: all tests passed");
