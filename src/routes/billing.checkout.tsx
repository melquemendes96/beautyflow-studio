import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /billing/checkout → /admin/plano/checkout */
export const Route = createFileRoute("/billing/checkout")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
    trial: typeof s.trial === "string" ? s.trial === "true" : true,
  }),
  beforeLoad: ({ search }) => {
    if (!search.planId) {
      throw redirect({ to: "/billing/plans", replace: true });
    }
    throw redirect({
      to: "/admin/plano/checkout",
      search: { planId: search.planId, trial: search.trial },
      replace: true,
    });
  },
  component: () => null,
});
