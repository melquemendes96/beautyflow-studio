import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingCompanyScreen } from "@/components/auth/OnboardingCompanyScreen";
import { readSessionQuick } from "@/lib/auth-bootstrap";
import { isMasterAccount } from "@/lib/auth-profile";
import { emptyLoginSearch } from "@/lib/challenge-60";

/** Só exige sessão — redirects pesados ficam no componente (evita travar navegação). */
export const Route = createFileRoute("/onboarding/company")({
  beforeLoad: async () => {
    const session = await readSessionQuick();
    if (!session) {
      throw redirect({ to: "/login", search: emptyLoginSearch, replace: true });
    }
    if (isMasterAccount(session)) {
      throw redirect({ to: "/master/empresas", replace: true });
    }
  },
  component: OnboardingCompanyPage,
});

function OnboardingCompanyPage() {
  return <OnboardingCompanyScreen />;
}
