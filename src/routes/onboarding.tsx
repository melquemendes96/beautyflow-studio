import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: primeira etapa do onboarding (marca). */
export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/branding", search: { onboarding: "1" }, replace: true });
  },
  component: () => null,
});
