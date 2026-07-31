import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import {
  CHALLENGE_QUERY_VALUE,
  CHALLENGE_TRIAL_DAYS,
  isChallengeSearchParam,
  saveChallengeIntent,
} from "@/lib/challenge-60";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
    desafio: typeof s.desafio === "string" ? s.desafio : undefined,
    leadId: typeof s.leadId === "string" ? s.leadId : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { planId, desafio, leadId } = Route.useSearch();
  const isChallenge = isChallengeSearchParam(desafio);

  useEffect(() => {
    if (!isChallenge) return;
    saveChallengeIntent({
      desafio: CHALLENGE_QUERY_VALUE,
      planId,
      leadId,
      trialDays: CHALLENGE_TRIAL_DAYS,
    });
  }, [isChallenge, planId, leadId]);

  return (
    <LoginScreen backTo="/" planId={planId} skipCheckout={isChallenge} leadId={leadId} />
  );
}
