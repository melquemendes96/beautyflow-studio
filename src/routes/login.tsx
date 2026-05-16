import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { guardPublicAuthRoute } from "@/lib/route-guards";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
  }),
  beforeLoad: async ({ search }) => {
    await guardPublicAuthRoute(search.planId);
  },
  component: LoginPage,
});

function LoginPage() {
  const { planId } = Route.useSearch();
  return <LoginScreen backTo="/" planId={planId} />;
}
