import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useCurrentCompany } from "@/lib/current-company";
import { getChallengeCountdown, pad2 } from "@/lib/challenge-60";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ChallengeCountdownDisplay } from "@/components/challenge/ChallengeCountdownDisplay";

/** Aviso no admin para quem está em trial (ex.: Desafio 60). */
export function ChallengeAdminBanner() {
  const { companyId, hasCompany } = useCurrentCompany();
  const c = getChallengeCountdown();

  const subQuery = useQuery({
    queryKey: ["admin", "subscription", "challenge-banner", companyId],
    enabled: Boolean(hasCompany && companyId && isSupabaseConfigured()),
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("tenant_subscriptions")
        .select("status, trial_end")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data as { status: string; trial_end: string | null } | null;
    },
    staleTime: 60_000,
  });

  const status = subQuery.data?.status;
  if (!hasCompany || status !== "trialing") return null;

  return (
    <div className="border-b border-gold/25 bg-gold/10 px-4 py-2.5 text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-foreground">
          <Sparkles className="size-4 shrink-0 text-gold" aria-hidden />
          <span>
            {c.ended ? (
              "Seu teste gratuito está ativo. Garanta um plano para não perder o acesso."
            ) : (
              <>
                Desafio 60 dias — faltam {c.days}d {pad2(c.hours)}:{pad2(c.minutes)}:{pad2(c.seconds)} no
                calendário do desafio
              </>
            )}
          </span>
        </p>
        <Link
          to="/admin/plano"
          search={{ checkout: undefined, billing: undefined, need: undefined }}
          className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          Garantir meu plano
        </Link>
      </div>
    </div>
  );
}

/** Reexport se precisar do display em outros lugares do admin. */
export { ChallengeCountdownDisplay };
