/**
 * Testes de acesso à assinatura (espelha src/lib/subscription-access.ts).
 * Executar: node scripts/subscription-access.test.mjs
 */
import assert from "node:assert/strict";

function parseTs(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

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
    const periodStarted = parseTs(sub.trial_start ?? sub.current_period_start);
    if (periodEnd !== null && periodEnd < now) return "trial_expired";
    if (periodStarted !== null && periodStarted > now) return "pending_payment";
    return "ok";
  }

  if (st === "past_due") return "past_due";
  return "no_subscription";
}

const now = new Date("2026-05-20T12:00:00Z").getTime();

// Bug reportado: active + trial_end no passado + current_period_end no futuro
assert.equal(
  getSubscriptionAccessReason(
    {
      status: "active",
      trial_end: "2025-01-08T00:00:00Z",
      current_period_end: "2027-07-01T00:00:00Z",
    },
    now,
  ),
  "ok",
);

assert.equal(
  getSubscriptionAccessReason(
    {
      status: "active",
      current_period_end: "2025-01-01T00:00:00Z",
    },
    now,
  ),
  "period_ended",
);

assert.equal(
  getSubscriptionAccessReason(
    {
      status: "trialing",
      trial_end: "2025-01-01T00:00:00Z",
    },
    now,
  ),
  "trial_expired",
);

console.log("subscription-access.test.mjs: OK");
