import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Alias em português: redireciona para `/login` (rota canônica) preservando `planId`.
 */
export const Route = createFileRoute("/entrar")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/login",
      search: { planId: search.planId },
      replace: true,
    });
  },
  component: () => null,
});
