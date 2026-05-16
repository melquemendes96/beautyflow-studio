import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias canônico: dashboard do tenant = /admin */
export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  },
  component: () => null,
});
