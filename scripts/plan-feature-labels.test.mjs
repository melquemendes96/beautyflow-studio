/**
 * node scripts/plan-feature-labels.test.mjs
 */
import assert from "node:assert/strict";

function normalizeFeatureLabelKey(label) {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\?\?/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXACT_CORRUPTED_LABEL = {
  "hist??rico": "Histórico",
  "p??gina p??blica": "Página pública",
  "servi??os": "Serviços",
};

const CANONICAL_BY_NORMALIZED_KEY = {
  historico: "Histórico",
  histrico: "Histórico",
  "pagina publica": "Página pública",
  "pgina pblica": "Página pública",
  servicos: "Serviços",
  servios: "Serviços",
};

function fixPlanFeatureLabel(label) {
  const trimmed = (label ?? "").trim();
  if (!trimmed.includes("??")) return trimmed;
  const exact = EXACT_CORRUPTED_LABEL[trimmed.toLowerCase()];
  if (exact) return exact;
  const key = normalizeFeatureLabelKey(trimmed);
  return CANONICAL_BY_NORMALIZED_KEY[key] ?? trimmed.replace(/\?\?/g, "");
}

assert.equal(fixPlanFeatureLabel("Hist??rico"), "Histórico");
assert.equal(fixPlanFeatureLabel("P??gina p??blica"), "Página pública");
assert.equal(fixPlanFeatureLabel("Servi??os"), "Serviços");
assert.equal(fixPlanFeatureLabel("Agenda"), "Agenda");

console.log("plan-feature-labels: all tests passed");
