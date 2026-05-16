import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /billing/plans → /admin/plano */
export const Route = createFileRoute("/billing/plans")({
  validateSearch: (s: Record<string, unknown>) => ({
    billing: typeof s.billing === "string" ? s.billing : undefined,
    planId: typeof s.planId === "string" ? s.planId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/plano",
      search: {
        billing: search.billing,
        checkout: undefined,
        need: undefined,
      },
      replace: true,
    });
  },
  component: () => null,
});
