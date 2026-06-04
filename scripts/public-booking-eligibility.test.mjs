/**
 * Espelha public.company_eligible_for_public_booking (Fase 2 auditoria).
 * Executar: node scripts/public-booking-eligibility.test.mjs
 */
import assert from "node:assert/strict";

function parsePeriodEndInclusive(value) {
  if (!value) return null;
  const raw = value.trim();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) || /T00:00:00(\.000)?Z?$/i.test(raw)) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d.getTime();
}

function getSubscriptionAccessReason(sub, now = Date.now()) {
  if (!sub?.status) return "no_subscription";
  const st = String(sub.status);

  if (st === "active") {
    const periodEnd = parsePeriodEndInclusive(sub.current_period_end);
    if (periodEnd !== null && periodEnd < now) return "period_ended";
    return "ok";
  }

  if (st === "trialing") {
    const periodEnd = parsePeriodEndInclusive(sub.trial_end ?? sub.current_period_end);
    const periodStarted = sub.trial_start ? new Date(sub.trial_start).getTime() : null;
    if (periodEnd !== null && periodEnd < now) return "trial_expired";
    if (periodStarted !== null && !Number.isNaN(periodStarted) && periodStarted > now) {
      return "pending_payment";
    }
    return "ok";
  }

  if (st === "past_due") return "past_due";
  if (st === "canceled") return "canceled";
  return "no_subscription";
}

function isCompanyEligibleForPublicBooking(companyStatus, subscription, now = Date.now()) {
  if (String(companyStatus ?? "") === "suspended") return false;
  return getSubscriptionAccessReason(subscription, now) === "ok";
}

const future = "2099-12-31";
const past = "2020-01-01";
const now = new Date("2026-06-01T12:00:00Z").getTime();

assert.equal(
  isCompanyEligibleForPublicBooking("active", { status: "active", current_period_end: future }, now),
  true,
);

assert.equal(
  isCompanyEligibleForPublicBooking("active", { status: "trialing", trial_end: future }, now),
  true,
);

assert.equal(
  isCompanyEligibleForPublicBooking("active", { status: "past_due", current_period_end: future }, now),
  false,
  "past_due não deve liberar /agendar mesmo com companies.status active",
);

assert.equal(
  isCompanyEligibleForPublicBooking("active", { status: "active", current_period_end: past }, now),
  false,
);

assert.equal(isCompanyEligibleForPublicBooking("suspended", { status: "active", current_period_end: future }, now), false);

assert.equal(isCompanyEligibleForPublicBooking("active", null, now), false);

console.log("public-booking-eligibility.test.mjs: OK");
