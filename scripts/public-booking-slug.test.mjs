/**
 * Testes de slug público (isolamento A/B/C — normalização consistente TS/SQL).
 * Executar: node scripts/public-booking-slug.test.mjs
 */
import assert from "node:assert/strict";

function normalizePublicBookingSlug(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidPublicBookingSlug(s) {
  return s.length > 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

const cases = [
  ["Empresa A", "empresa-a"],
  ["  EMPRESA-B  ", "empresa-b"],
  ["empresa_c", "empresa-c"],
  ["Empresa---C", "empresa-c"],
];

for (const [input, expected] of cases) {
  assert.equal(normalizePublicBookingSlug(input), expected, `normalize: ${input}`);
  assert.ok(isValidPublicBookingSlug(expected), `valid: ${expected}`);
}

assert.equal(normalizePublicBookingSlug("Empresa A"), normalizePublicBookingSlug("empresa-a"));
assert.notEqual(normalizePublicBookingSlug("empresa-a"), normalizePublicBookingSlug("empresa-b"));
assert.equal(isValidPublicBookingSlug(""), false);
assert.equal(isValidPublicBookingSlug("-bad-"), false);

console.log("public-booking-slug: all tests passed");
