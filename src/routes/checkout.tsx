import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: checkout de assinatura (rota canônica `/admin/plano/checkout`). */
export const Route = createFileRoute("/checkout")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
    trial: s.trial === "true" || s.trial === true,
  }),
  beforeLoad: ({ search }) => {
    if (!search.planId) {
      throw redirect({ to: "/admin/plano", replace: true });
    }
    throw redirect({
      to: "/admin/plano/checkout",
      search: {
        planId: search.planId,
        trial: Boolean(search.trial),
        checkout: undefined,
        billing: undefined,
      },
      replace: true,
    });
  },
  component: () => null,
});
