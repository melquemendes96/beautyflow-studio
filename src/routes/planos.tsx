import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: escolha de plano no painel empresa. */
export const Route = createFileRoute("/planos")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/plano", replace: true });
  },
  component: () => null,
});
