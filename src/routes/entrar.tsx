import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Alias em português: redireciona para `/login` (rota canônica) preservando `planId`.
 */
export const Route = createFileRoute("/entrar")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
    desafio: typeof s.desafio === "string" ? s.desafio : undefined,
    leadId: typeof s.leadId === "string" ? s.leadId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/login",
      search: {
        planId: search.planId,
        desafio: search.desafio,
        leadId: search.leadId,
      },
      replace: true,
    });
  },
  component: () => null,
});
