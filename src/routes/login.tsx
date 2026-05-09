import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { loadAuthProfile } from "@/lib/auth-profile";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const profile = await loadAuthProfile();
    if (!profile.session) return;
    if (profile.companyMemberships.length > 0) {
      if (search.planId) {
        throw redirect({ to: "/admin/plano/checkout", search: { planId: search.planId, trial: false } });
      }
      throw redirect({ to: "/admin" });
    }
    if (profile.isPlatformAdmin) {
      throw redirect({ to: "/master" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { planId } = Route.useSearch();
  return <LoginScreen backTo="/" planId={planId} />;
}
