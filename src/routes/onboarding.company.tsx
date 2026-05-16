import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingCompanyScreen } from "@/components/auth/OnboardingCompanyScreen";
import { loadAuthProfile } from "@/lib/auth-profile";
import { resolveAuthDestinationFromProfile } from "@/lib/auth-routing";

export const Route = createFileRoute("/onboarding/company")({
  beforeLoad: async () => {
    const profile = await loadAuthProfile();
    if (!profile.session) {
      throw redirect({ to: "/login" });
    }
    if (profile.isPlatformAdmin) {
      throw redirect({ to: "/master" });
    }
    const dest = resolveAuthDestinationFromProfile(profile);
    if (dest.kind !== "onboarding_company" && dest.path) {
      throw redirect({ to: dest.path, search: "search" in dest ? dest.search : undefined });
    }
  },
  component: OnboardingCompanyPage,
});

function OnboardingCompanyPage() {
  return <OnboardingCompanyScreen />;
}
