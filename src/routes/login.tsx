import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/components/auth/LoginScreen";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { planId } = Route.useSearch();
  return <LoginScreen backTo="/" planId={planId} />;
}
