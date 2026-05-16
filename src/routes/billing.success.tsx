import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/billing/success")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/plano", search: { checkout: "success" }, replace: true });
  },
  component: () => null,
});
