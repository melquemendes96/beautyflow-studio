import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: onboarding → cadastro da empresa. */
export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/company", replace: true });
  },
  component: () => null,
});
