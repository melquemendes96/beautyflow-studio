import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /billing/plans → /admin/plano */
export const Route = createFileRoute("/billing/plans")({
  validateSearch: (s: Record<string, unknown>) => ({
    billing: typeof s.billing === "string" ? s.billing : undefined,
    planId: typeof s.planId === "string" ? s.planId : undefined,
    need: typeof s.need === "string" ? s.need : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/plano",
      search: {
        billing: search.billing,
        checkout: undefined,
        need: search.need,
      },
      replace: true,
    });
  },
  component: () => null,
});
