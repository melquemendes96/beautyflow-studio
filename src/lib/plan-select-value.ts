/**
 * Radix UI Select reserves empty string: SelectItem must not use value="".
 * Use this stable sentinel everywhere we mean "sem plano" in controlled Selects.
 *
 * Must never collide with real `plans.id` (UUID). Prefix + suffix are not valid UUID chars alone as full id.
 */
export const NO_PLAN_SELECT_VALUE = "__bf_no_plan__" as const;

export function planIdToSelectValue(planId: string | null | undefined): string {
  if (planId == null) return NO_PLAN_SELECT_VALUE;
  const s = String(planId).trim();
  return s === "" ? NO_PLAN_SELECT_VALUE : s;
}

export function selectValueToPlanId(value: string): string | null {
  if (value === NO_PLAN_SELECT_VALUE) return null;
  const s = value.trim();
  return s === "" ? null : s;
}
