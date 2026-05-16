import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /register → /cadastro */
export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/cadastro", search, replace: true });
  },
  component: () => null,
});
