import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/billing/cancel")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/plano", search: { checkout: "cancel" }, replace: true });
  },
  component: () => null,
});
