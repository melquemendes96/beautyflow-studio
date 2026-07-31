import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Mail, Sparkles, Building2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { authService } from "@/services/authService";
import { fetchPublicPlans } from "@/lib/fetch-public-plans";
import { PublicPlansLoadError } from "@/components/site/PublicPlansLoadError";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthProvider";
import { readStudioNameFromUrl } from "@/lib/oauth-signup-intent";
import { usePublicAuthRedirect } from "@/lib/use-public-auth-redirect";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import {
  CHALLENGE_QUERY_VALUE,
  CHALLENGE_TRIAL_DAYS,
  isChallengeSearchParam,
  pickBestPlanId,
  readChallengeIntent,
  saveChallengeIntent,
} from "@/lib/challenge-60";

function CadastroRouteError({ error, reset }: { error: Error; reset: () => void }) {
  if (import.meta.env.DEV) {
    console.error("[/cadastro]", error);
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <h1 className="font-display text-xl">Não foi possível carregar o cadastro agora.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente novamente em instantes. Se o problema continuar, volte à página inicial.
        </p>
        {import.meta.env.DEV && (
          <p className="mt-3 break-all text-left text-xs text-destructive">{error.message}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => reset()}>
            Tentar novamente
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link to="/">Voltar para início</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/cadastro")({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: typeof s.planId === "string" ? s.planId : undefined,
    desafio: typeof s.desafio === "string" ? s.desafio : undefined,
    leadId: typeof s.leadId === "string" ? s.leadId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Criar conta — JM BeautyFlow" },
      {
        name: "description",
        content: "Cadastre seu studio e comece a usar a agenda BeautyFlow em minutos.",
      },
    ],
  }),
  component: Cadastro,
  errorComponent: CadastroRouteError,
});

function formatBrl(value: number) {
  return value.toFixed(2).replace(".", ",");
}

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function passwordChecks(pw: string) {
  return {
    len: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
  };
}

function passwordMeetsPolicy(pw: string) {
  const c = passwordChecks(pw);
  return c.len && c.lower && c.upper && c.digit;
}

function formatSignupError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  const msg = raw && raw.length > 0 ? raw : "Não foi possível criar sua conta. Tente novamente.";
  if (msg.includes("429")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (/already registered|already exists|User already registered/i.test(msg)) {
    return "Este e-mail já está cadastrado. Faça login ou use outro e-mail.";
  }
  if (/password|weak/i.test(msg)) return "Senha fraca. Use os requisitos indicados abaixo.";
  return msg;
}

type PublicPlanRow = { id: string; name: string; price?: number | null; features?: string[] | null };

function Cadastro() {
  const { planId: planIdFromUrl, desafio, leadId } = Route.useSearch();
  const isChallenge = isChallengeSearchParam(desafio) || Boolean(readChallengeIntent());
  const challengeIntent = readChallengeIntent();
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(planIdFromUrl);
  const { isPlatformAdmin } = useAuth();

  const effectivePlanId = planIdFromUrl ?? selectedPlanId ?? challengeIntent?.planId;

  useEffect(() => {
    if (planIdFromUrl) setSelectedPlanId(planIdFromUrl);
  }, [planIdFromUrl]);

  usePublicAuthRedirect(isChallenge ? undefined : effectivePlanId, { skip: isPlatformAdmin });

  const [step, setStep] = useState<"account" | "verify_email">("account");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    companyName?: string;
    email?: string;
    password?: string;
  }>({});

  const pwStatus = passwordChecks(password);

  useEffect(() => {
    const fromUrl = readStudioNameFromUrl();
    const fromChallenge = challengeIntent?.companyName;
    if (fromChallenge && fromChallenge.length >= 2) setCompanyName(fromChallenge);
    else if (fromUrl) setCompanyName(fromUrl);
    if (challengeIntent?.email) setEmail(challengeIntent.email);
  }, []);

  const plansQuery = useQuery({
    queryKey: ["public", "plans", "cadastro"],
    queryFn: fetchPublicPlans,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const activePlans = useMemo(() => (plansQuery.data ?? []) as PublicPlanRow[], [plansQuery.data]);

  const displayPlans = activePlans;

  const challengePlanId = useMemo(() => {
    if (!isChallenge) return effectivePlanId;
    return effectivePlanId ?? pickBestPlanId(activePlans);
  }, [isChallenge, effectivePlanId, activePlans]);

  useEffect(() => {
    if (!isChallenge) return;
    const plan = challengePlanId ?? pickBestPlanId(activePlans);
    saveChallengeIntent({
      desafio: CHALLENGE_QUERY_VALUE,
      planId: plan,
      leadId: leadId ?? challengeIntent?.leadId,
      trialDays: CHALLENGE_TRIAL_DAYS,
      companyName: companyName.trim() || challengeIntent?.companyName,
      email: email.trim() || challengeIntent?.email,
    });
  }, [isChallenge, challengePlanId, leadId, activePlans, companyName, email]);

  const selectedPlan = useMemo(() => {
    const id = isChallenge ? challengePlanId : effectivePlanId;
    if (!id || id.startsWith("fallback-")) return null;
    return displayPlans.find((p) => String(p.id) === String(id)) ?? null;
  }, [displayPlans, effectivePlanId, challengePlanId, isChallenge]);

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const name = companyName.trim();
      const e = email.trim();
      if (name.length < 2) throw new Error("Informe o nome do studio (mínimo 2 caracteres).");
      if (!emailOk(e)) throw new Error("Digite um e-mail válido.");
      if (!passwordMeetsPolicy(password)) throw new Error("A senha não atende aos requisitos abaixo.");
      const loginBase = window.location.origin + "/login";
      const planForRedirect = isChallenge ? challengePlanId : effectivePlanId;
      let emailRedirectTo = loginBase;
      if (planForRedirect) {
        emailRedirectTo = `${loginBase}?planId=${encodeURIComponent(planForRedirect)}`;
        if (isChallenge) {
          emailRedirectTo += `&desafio=${CHALLENGE_QUERY_VALUE}`;
          const lid = leadId ?? challengeIntent?.leadId;
          if (lid) emailRedirectTo += `&leadId=${encodeURIComponent(lid)}`;
        }
      } else if (isChallenge) {
        emailRedirectTo = `${loginBase}?desafio=${CHALLENGE_QUERY_VALUE}`;
      }
      if (isChallenge) {
        saveChallengeIntent({
          desafio: CHALLENGE_QUERY_VALUE,
          planId: challengePlanId,
          leadId: leadId ?? challengeIntent?.leadId,
          trialDays: CHALLENGE_TRIAL_DAYS,
          companyName: name,
          email: e,
        });
      }
      const signUp = await authService.signUpWithPassword(e, password, {
        companyName: name,
        emailRedirectTo,
      });
      if (signUp.error) throw signUp.error;
    },
    onSuccess: () => {
      setError(null);
      setFieldErrors({});
      setStep("verify_email");
      trackMarketingEvent("signup_complete", {
        oncePerSession: true,
        method: isChallenge ? "challenge_60" : "password",
      });
      if (isChallenge) {
        trackMarketingEvent("challenge_signup", { persist: true });
      }
    },
    onError: (err: unknown) => {
      setError(formatSignupError(err));
    },
  });

  const validateForm = () => {
    const fe: typeof fieldErrors = {};
    const name = companyName.trim();
    if (name.length < 2) fe.companyName = "Mínimo 2 caracteres.";
    if (!emailOk(email)) fe.email = "E-mail inválido.";
    if (!passwordMeetsPolicy(password)) fe.password = "Use os requisitos indicados abaixo.";
    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  };

  const onAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Crie o arquivo .env na raiz do projeto com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (JWT eyJ...). Valores em: Supabase → Configurações do projeto → API → Legacy anon. Depois reinicie o npm run dev.",
      );
      return;
    }
    if (!validateForm()) return;
    createAccountMutation.mutate();
  };

  const loginSearch = {
    planId: isChallenge ? challengePlanId : effectivePlanId,
    desafio: isChallenge ? CHALLENGE_QUERY_VALUE : undefined,
    leadId: isChallenge ? (leadId ?? challengeIntent?.leadId) : undefined,
  };
  const pending = createAccountMutation.isPending;

  return (
    <div className="grid min-h-screen lg:grid-cols-2" style={{ background: "var(--gradient-hero)" }}>
      <div
        className="hidden flex-col justify-between p-12 text-background lg:flex"
        style={{ background: "var(--charcoal)" }}
      >
        <Logo className="h-12 max-w-[260px]" />
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-gold">
            <Sparkles className="size-3" /> Conta gratuita para começar
          </span>
          <h1 className="mt-6 font-display text-4xl leading-tight">
            Configure seu studio em poucos minutos
          </h1>
          <p className="mt-4 max-w-md text-background/70">
            Crie sua conta, vincule seu plano e acesse o painel com agenda, clientes e página pública pronta para
            personalizar.
          </p>
          <ul className="mt-10 max-w-md space-y-4 text-sm text-background/65">
            {[
              "Página de agendamento com a identidade da sua marca",
              "Gestão de clientes, serviços e disponibilidade",
              "Cobrança segura e suporte quando precisar",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold/25 text-gold">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-background/40">
          Ao continuar, você concorda com o uso dos seus dados conforme a política de privacidade do serviço.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-elegant">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Logo onLight className="h-11 max-w-[240px]" />
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link to="/">Voltar</Link>
            </Button>
          </div>

          {step === "account" && (
            <>
              <h1 className="font-display text-2xl tracking-tight">Criar sua conta</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cadastre-se com e-mail e senha. Depois você pode entrar também com Google (mesmo e-mail) na tela de
                login.
              </p>

              <div className="mt-5 rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
                {isChallenge ? (
                  <>
                    <div className="font-medium text-foreground">Desafio 60 dias · sem cartão</div>
                    <p className="mt-2 text-muted-foreground">
                      {selectedPlan
                        ? `${selectedPlan.name} · acesso completo por 60 dias grátis`
                        : "Melhor plano liberado automaticamente após confirmar o e-mail."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Você não precisa escolher plano nem cadastrar pagamento neste fluxo.
                    </p>
                  </>
                ) : (
                  <>
                <div className="font-medium text-foreground">
                  {planIdFromUrl || selectedPlan ? "Plano escolhido" : "Escolha um plano (opcional)"}
                </div>
                {plansQuery.isLoading && (
                  <div className="mt-2 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                )}
                {plansQuery.isError && (
                  <div className="mt-3">
                    <PublicPlansLoadError
                      onRetry={() => void plansQuery.refetch()}
                      isRetrying={plansQuery.isFetching}
                    />
                  </div>
                )}
                {!plansQuery.isLoading && !plansQuery.isError && !planIdFromUrl && activePlans.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {activePlans.slice(0, 3).map((p) => {
                      const picked = effectivePlanId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPlanId(picked ? undefined : p.id)}
                          className={`rounded-xl border px-3 py-2 text-left transition ${
                            picked
                              ? "border-gold bg-gold/10"
                              : "border-border bg-background/60 hover:border-gold/40"
                          }`}
                        >
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            R$ {formatBrl(Number(p.price ?? 0))}/mês
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!plansQuery.isLoading && selectedPlan && (
                  <p className="mt-2 text-muted-foreground">
                    {selectedPlan.name} · R$ {formatBrl(Number(selectedPlan.price ?? 0))}/mês
                  </p>
                )}
                {!plansQuery.isLoading && effectivePlanId && !selectedPlan && (
                  <p className="mt-2 text-muted-foreground">
                    Plano não encontrado. Você poderá escolher um plano depois.
                  </p>
                )}
                {!plansQuery.isLoading && !effectivePlanId && activePlans.length === 0 && (
                  <p className="mt-2 text-muted-foreground">
                    Você pode criar a conta agora e escolher o plano no painel depois.
                  </p>
                )}
                  </>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <form onSubmit={(ev) => void onAccountSubmit(ev)} className="mt-6" aria-busy={pending}>
                <div className="grid gap-4">
                  <label className="grid gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Building2 className="size-3.5" />
                      Nome do studio
                    </span>
                    <Input
                      name="companyName"
                      value={companyName}
                      onChange={(ev) => {
                        setCompanyName(ev.target.value);
                        if (fieldErrors.companyName) setFieldErrors((f) => ({ ...f, companyName: undefined }));
                      }}
                      placeholder="Ex.: Joyce Mendes Beauty"
                      autoComplete="organization"
                      aria-invalid={fieldErrors.companyName ? true : undefined}
                      className="h-11 rounded-xl"
                    />
                    {fieldErrors.companyName && (
                      <span className="text-xs text-destructive">{fieldErrors.companyName}</span>
                    )}
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">E-mail</span>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        name="email"
                        value={email}
                        onChange={(ev) => {
                          setEmail(ev.target.value);
                          if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                        }}
                        placeholder="voce@studio.com"
                        autoComplete="email"
                        required
                        aria-invalid={fieldErrors.email ? true : undefined}
                        className="h-11 rounded-xl pl-10"
                      />
                    </div>
                    {fieldErrors.email && <span className="text-xs text-destructive">{fieldErrors.email}</span>}
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Senha</span>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <PasswordInput
                        name="password"
                        value={password}
                        onChange={(ev) => {
                          setPassword(ev.target.value);
                          if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                        }}
                        placeholder="Crie uma senha forte"
                        autoComplete="new-password"
                        required
                        toggleLabel="senha de cadastro"
                        aria-invalid={fieldErrors.password ? true : undefined}
                        className="h-11 rounded-xl pl-10"
                      />
                    </div>
                    {fieldErrors.password && (
                      <span className="text-xs text-destructive">{fieldErrors.password}</span>
                    )}
                    <ul className="mt-1 grid gap-1 text-[11px] text-muted-foreground sm:text-xs">
                      {[
                        ["Mínimo 8 caracteres", pwStatus.len],
                        ["Uma letra minúscula", pwStatus.lower],
                        ["Uma letra maiúscula", pwStatus.upper],
                        ["Um número", pwStatus.digit],
                      ].map(([label, ok]) => (
                        <li key={String(label)} className={ok ? "text-success" : ""}>
                          <Check className="mr-1 inline size-3.5 align-text-bottom opacity-70" />
                          {label}
                        </li>
                      ))}
                    </ul>
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button type="submit" className="h-11 flex-1 rounded-full sm:min-w-[12rem]" disabled={pending}>
                    {pending ? "Criando…" : "Criar conta"}
                  </Button>
                  <Button variant="outline" className="h-11 rounded-full" type="button" asChild>
                    <Link to="/login" search={loginSearch} className="inline-flex items-center justify-center">
                      Já tenho conta
                    </Link>
                  </Button>
                </div>
              </form>
            </>
          )}

          {step === "verify_email" && (
            <div aria-live="polite">
              <h1 className="font-display text-2xl tracking-tight">Verifique seu e-mail</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviamos um link de confirmação para{" "}
                <span className="font-medium text-foreground">{email.trim()}</span>. Confirme sua conta e entre com
                e-mail e senha (ou Google, mesmo e-mail) na tela de login.
              </p>

              <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                Seu studio <span className="font-medium text-foreground">{companyName.trim()}</span> será criado
                automaticamente no primeiro login
                {effectivePlanId && selectedPlan ? (
                  <>
                    {" "}
                    com o plano <span className="font-medium text-foreground">{selectedPlan.name}</span>
                  </>
                ) : null}
                .
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button className="h-11 rounded-full" type="button" asChild>
                  <Link to="/login" search={loginSearch} className="inline-flex items-center justify-center">
                    Já confirmei, quero entrar
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-full"
                  type="button"
                  onClick={() => {
                    setPassword("");
                    setError(null);
                    setStep("account");
                  }}
                >
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
