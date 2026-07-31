import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Instagram, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ChallengeCountdownDisplay } from "@/components/challenge/ChallengeCountdownDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import {
  CHALLENGE_HEADLINE,
  CHALLENGE_INSTAGRAM_HANDLE,
  CHALLENGE_INSTAGRAM_URL,
  CHALLENGE_QUERY_VALUE,
  CHALLENGE_SUBHEAD,
  CHALLENGE_TRIAL_DAYS,
  getChallengeCountdown,
  pickBestPlanId,
  saveChallengeIntent,
} from "@/lib/challenge-60";
import { fetchPublicPlans } from "@/lib/fetch-public-plans";
import { captureMarketingAttributionFromUrl, trackMarketingEvent } from "@/lib/marketing-analytics";
import { challengeService } from "@/services/challengeService";

export const Route = createFileRoute("/desafio")({
  validateSearch: (s: Record<string, unknown>) => ({
    desafio: typeof s.desafio === "string" ? s.desafio : CHALLENGE_QUERY_VALUE,
  }),
  head: () => ({
    meta: [
      { title: "Desafio 60 dias grátis — JM BeautyFlow" },
      {
        name: "description",
        content: CHALLENGE_HEADLINE,
      },
    ],
  }),
  component: DesafioPage,
});

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function DesafioPage() {
  const navigate = useNavigate();
  const ended = getChallengeCountdown().ended;

  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [followedTip, setFollowedTip] = useState(false);

  useEffect(() => {
    captureMarketingAttributionFromUrl();
    trackMarketingEvent("challenge_banner_view", { oncePerSession: true, placement: "desafio_page" });
  }, []);

  const plansQuery = useQuery({
    queryKey: ["public", "plans", "desafio"],
    queryFn: fetchPublicPlans,
    staleTime: 5 * 60_000,
  });

  const bestPlanId = useMemo(
    () => pickBestPlanId((plansQuery.data ?? []) as { id: string; price?: number | null }[]),
    [plansQuery.data],
  );

  const bestPlanName = useMemo(() => {
    const plans = (plansQuery.data ?? []) as { id: string; name: string }[];
    return plans.find((p) => p.id === bestPlanId)?.name ?? "Plano completo";
  }, [plansQuery.data, bestPlanId]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (fullName.trim().length < 2) throw new Error("Informe seu nome completo.");
      if (whatsapp.replace(/\D/g, "").length < 10) throw new Error("Informe um WhatsApp válido.");
      if (!emailOk(email)) throw new Error("Informe um e-mail válido.");
      if (instagram.replace(/^@/, "").trim().length < 2) throw new Error("Informe seu Instagram.");
      if (businessName.trim().length < 2) throw new Error("Informe o nome do seu negócio.");

      const { data, error: rpcError } = await challengeService.submitLead({
        fullName: fullName.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim(),
        instagram: instagram.trim(),
        businessName: businessName.trim(),
      });
      if (rpcError) throw rpcError;
      if (!data?.ok || !data.lead_id) {
        const code = data?.error;
        if (code === "email_invalido") throw new Error("E-mail inválido.");
        if (code === "whatsapp_invalido") throw new Error("WhatsApp inválido.");
        throw new Error("Não foi possível salvar seus dados. Tente novamente.");
      }
      return String(data.lead_id);
    },
    onSuccess: (leadId) => {
      setError(null);
      saveChallengeIntent({
        desafio: CHALLENGE_QUERY_VALUE,
        planId: bestPlanId,
        leadId,
        trialDays: CHALLENGE_TRIAL_DAYS,
        companyName: businessName.trim(),
        email: email.trim(),
      });
      trackMarketingEvent("challenge_lead_submit", { persist: true, lead_id: leadId });
      trackMarketingEvent("signup_start", { oncePerSession: true, method: "challenge_60" });
      void navigate({
        to: "/cadastro",
        search: {
          desafio: CHALLENGE_QUERY_VALUE,
          planId: bestPlanId,
          leadId,
        },
      });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Erro ao continuar.");
    },
  });

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="container-page py-10 md:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Voltar ao site
        </Link>

        <div className="mx-auto mt-8 grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <Logo onLight className="h-11 max-w-[220px]" />
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-gold">
              <Sparkles className="size-3" /> Desafio 60 dias
            </span>
            <h1 className="mt-4 font-display text-3xl leading-tight md:text-4xl">{CHALLENGE_HEADLINE}</h1>
            <p className="mt-3 text-muted-foreground">{CHALLENGE_SUBHEAD}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Você entra no <strong className="text-foreground">{bestPlanName}</strong> — todas as ferramentas, sem
              cadastro de pagamento durante o desafio.
            </p>

            <div className="mt-6 rounded-2xl border border-border bg-card/80 p-5 shadow-soft">
              <p className="text-center text-xs uppercase tracking-wider text-muted-foreground">
                {ended ? "Status" : "Contagem regressiva até o fim"}
              </p>
              <div className="mt-3">
                <ChallengeCountdownDisplay />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-foreground/15 bg-background/50 p-4">
              <p className="text-sm font-medium">Recomendado (não obrigatório)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Siga{" "}
                <a
                  href={CHALLENGE_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  @{CHALLENGE_INSTAGRAM_HANDLE}
                </a>{" "}
                para acompanhar dicas e lives do desafio.
              </p>
              <a
                href={CHALLENGE_INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setFollowedTip(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                <Instagram className="size-4" />
                Abrir Instagram
              </a>
              {followedTip ? (
                <p className="mt-2 text-xs text-success">Ótimo — continue o cadastro abaixo.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant sm:p-8">
            {ended ? (
              <div className="text-center">
                <h2 className="font-display text-xl">Inscrições encerradas</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  O desafio terminou. Você ainda pode criar sua conta e escolher um plano normalmente.
                </p>
                <Button className="mt-6" asChild>
                  <Link to="/cadastro" search={{ planId: undefined, desafio: undefined, leadId: undefined }}>
                    Criar conta
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <h2 className="font-display text-xl">Participe do desafio</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preencha seus dados e depois crie a senha da conta — sem escolher plano e sem cartão.
                </p>

                {error ? (
                  <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <form
                  className="mt-5 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    submitMutation.mutate();
                  }}
                >
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Nome completo</span>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
                    <Input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="(11) 99999-9999"
                      autoComplete="tel"
                      required
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">E-mail</span>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Instagram</span>
                    <Input
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="@seu.studio"
                      required
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Nome do negócio</span>
                    <Input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Ex.: Studio Ana Beleza"
                      autoComplete="organization"
                      required
                    />
                  </label>
                  <Button type="submit" className="mt-2 min-h-11" disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? "Salvando…" : "Criar minha conta grátis"}
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Ao continuar, você cria a conta no fluxo seguro do JM BeautyFlow. Planos e pagamento só aparecem
                    no cadastro normal — não neste desafio.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
