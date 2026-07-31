import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /register → /cadastro */
export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
    desafio: typeof s.desafio === "string" ? s.desafio : undefined,
    leadId: typeof s.leadId === "string" ? s.leadId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/cadastro",
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
