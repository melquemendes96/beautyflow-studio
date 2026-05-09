import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: área de pagamento / cobrança no painel. */
export const Route = createFileRoute("/pagamento")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/plano", replace: true });
  },
  component: () => null,
});
