/**
 * Testes do fallback legado de planos (espelha src/lib/plan-access.ts e legacy_plan_allows_feature SQL).
 * Executar: node scripts/plan-features-access.test.mjs
 */
import assert from "node:assert/strict";

function normalizePlanName(name) {
  return (name ?? "").toLowerCase().trim();
}

function legacyPlanNameAllowsFeature(planName, feature) {
  const n = normalizePlanName(planName);
  if (!n) return false;

  const isElite = n.includes("elite");
  const isPro =
    n.includes("studio pro") ||
    (n.includes("pro") && !isElite) ||
    n.includes("stúdio pro") ||
    n.includes("profissional");

  if (feature === "whatsapp" || feature === "automation" || feature === "finance") {
    return isElite;
  }
  if (feature === "branding" || feature === "waitlist" || feature === "reports") {
    return isPro || isElite;
  }
  return true;
}

const essencial = "Essencial Beauty";
const studioPro = "Studio Pro";
const elite = "Elite Beauty";
const maLike = "Studio Pro"; // MA Barbearia tier típico

assert.equal(legacyPlanNameAllowsFeature(essencial, "agenda"), true);
assert.equal(legacyPlanNameAllowsFeature(essencial, "whatsapp"), false);
assert.equal(legacyPlanNameAllowsFeature(essencial, "branding"), false);
assert.equal(legacyPlanNameAllowsFeature(essencial, "reports"), false);

assert.equal(legacyPlanNameAllowsFeature(studioPro, "branding"), true);
assert.equal(legacyPlanNameAllowsFeature(studioPro, "waitlist"), true);
assert.equal(legacyPlanNameAllowsFeature(studioPro, "reports"), true);
assert.equal(legacyPlanNameAllowsFeature(studioPro, "whatsapp"), false);
assert.equal(legacyPlanNameAllowsFeature(maLike, "public_booking"), true);

assert.equal(legacyPlanNameAllowsFeature(elite, "whatsapp"), true);
assert.equal(legacyPlanNameAllowsFeature(elite, "automation"), true);
assert.equal(legacyPlanNameAllowsFeature(elite, "finance"), true);
assert.equal(legacyPlanNameAllowsFeature(elite, "branding"), true);

assert.equal(legacyPlanNameAllowsFeature("", "agenda"), false);
assert.equal(legacyPlanNameAllowsFeature(null, "clients"), false);

console.log("plan-features-access: all tests passed");
