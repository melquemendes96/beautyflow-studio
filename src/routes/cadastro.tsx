import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, Mail, Sparkles, Building2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { authService } from "@/services/authService";
import { subscriptionService } from "@/services/subscriptionService";
import { PUBLIC_PLANS_FALLBACK } from "@/lib/public-plans-fallback";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthProvider";
import {
  clearOAuthFlowContext,
  readOAuthFlowContext,
  readStudioNameFromUrl,
  saveOAuthFlowContext,
} from "@/lib/oauth-signup-intent";
import { navigateAfterAuthenticatedSession } from "@/lib/complete-auth-onboarding";
import { usePublicAuthRedirect } from "@/lib/use-public-auth-redirect";

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
  const { planId: planIdFromUrl } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(planIdFromUrl);
  const {
    session,
    profileReady,
    isPlatformAdmin,
    companyMemberships,
    isLoading,
    refresh: refreshAuth,
  } = useAuth();
  const oauthHandledRef = useRef(false);

  const effectivePlanId = planIdFromUrl ?? selectedPlanId;

  useEffect(() => {
    if (planIdFromUrl) setSelectedPlanId(planIdFromUrl);
  }, [planIdFromUrl]);

  usePublicAuthRedirect(effectivePlanId, { skip: isPlatformAdmin });

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
  const [googlePending, setGooglePending] = useState(false);

  const pwStatus = passwordChecks(password);

  useEffect(() => {
    const c = readOAuthFlowContext();
    if (c?.mode === "login") clearOAuthFlowContext();
    const fromUrl = readStudioNameFromUrl();
    if (fromUrl) setCompanyName(fromUrl);
    else if (c?.mode === "signup" && c.companyName) setCompanyName(c.companyName);
    if (c?.planId) setSelectedPlanId(c.planId);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || !profileReady || !session) return;
    if (isPlatformAdmin || companyMemberships.length > 0) return;

    const ctx = readOAuthFlowContext();
    if (!ctx || ctx.mode !== "signup") return;
    if (oauthHandledRef.current) return;
    oauthHandledRef.current = true;
    setError(null);

    void (async () => {
      const res = await navigateAfterAuthenticatedSession({
        navigate,
        planId: ctx.planId ?? effectivePlanId,
        preferTrial: true,
        companyName: ctx.companyName?.trim() ? ctx.companyName : null,
        refreshAuth,
      });
      if (!res.ok) {
        oauthHandledRef.current = false;
        if (res.code === "needs_company_name") setStep("account");
        setError(res.error);
        return;
      }
      clearOAuthFlowContext();
    })();
  }, [
    session,
    profileReady,
    isPlatformAdmin,
    companyMemberships.length,
    effectivePlanId,
    navigate,
    refreshAuth,
  ]);

  const plansQuery = useQuery({
    queryKey: ["public", "plans", "cadastro"],
    queryFn: async () => {
      const res = await subscriptionService.listPlans();
      const rows = (res.data ?? []) as PublicPlanRow[];
      if (!res.error && rows.length > 0) return rows;
      return PUBLIC_PLANS_FALLBACK.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        features: p.features,
      }));
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const activePlans = useMemo(() => {
    const rows = (plansQuery.data ?? []) as PublicPlanRow[];
    return rows.filter((p) => !String(p.id).startsWith("fallback-"));
  }, [plansQuery.data]);

  const displayPlans = useMemo(() => {
    const rows = (plansQuery.data ?? []) as PublicPlanRow[];
    if (rows.length > 0) return rows;
    return PUBLIC_PLANS_FALLBACK.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      features: p.features,
    }));
  }, [plansQuery.data]);

  const selectedPlan = useMemo(() => {
    if (!effectivePlanId || effectivePlanId.startsWith("fallback-")) return null;
    return displayPlans.find((p) => String(p.id) === String(effectivePlanId)) ?? null;
  }, [displayPlans, effectivePlanId]);

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const name = companyName.trim();
      const e = email.trim();
      if (name.length < 2) throw new Error("Informe o nome do studio (mínimo 2 caracteres).");
      if (!emailOk(e)) throw new Error("Digite um e-mail válido.");
      if (!passwordMeetsPolicy(password)) throw new Error("A senha não atende aos requisitos abaixo.");
      const loginBase = window.location.origin + "/login";
      const emailRedirectTo = effectivePlanId
        ? `${loginBase}?planId=${encodeURIComponent(effectivePlanId)}`
        : loginBase;
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
    const name = companyName.trim();
    saveOAuthFlowContext({
      mode: "signup",
      companyName: name,
      planId: effectivePlanId,
    });
    if (!isSupabaseConfigured()) {
      setError(
        "Crie o arquivo .env na raiz do projeto com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (JWT eyJ...). Valores em: Supabase → Configurações do projeto → API → Legacy anon. Depois reinicie o npm run dev.",
      );
      return;
    }
    if (!validateForm()) return;
    createAccountMutation.mutate();
  };

  const onGoogle = async () => {
    setError(null);
    setFieldErrors({});
    if (!isSupabaseConfigured()) {
      setError(
        "Configure o Supabase no .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY eyJ...) e reinicie o servidor.",
      );
      return;
    }
    const name = companyName.trim();
    if (name.length < 2) {
      setFieldErrors({ companyName: "Informe o nome do studio para continuar com o Google." });
      return;
    }
    setGooglePending(true);
    try {
      saveOAuthFlowContext({
        mode: "signup",
        companyName: name,
        planId: effectivePlanId,
      });
      const { data, error: oErr } = await authService.signInWithGoogle();
      if (oErr) {
        clearOAuthFlowContext();
        setError(oErr.message || "Não foi possível abrir o Google. Tente de novo.");
        return;
      }
      if (data?.url) {
        window.location.assign(data.url);
      }
    } finally {
      setGooglePending(false);
    }
  };

  const loginSearch = effectivePlanId ? { planId: effectivePlanId } : {};
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
                Use Google ou e-mail. Sua empresa será criada automaticamente no primeiro acesso.
              </p>

              <div className="mt-5 rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
                <div className="font-medium text-foreground">
                  {planIdFromUrl || selectedPlan ? "Plano escolhido" : "Escolha um plano (opcional)"}
                </div>
                {plansQuery.isLoading && (
                  <div className="mt-2 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                )}
                {!plansQuery.isLoading && !planIdFromUrl && activePlans.length > 0 && (
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
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <div className="mt-6">
                <GoogleOAuthButton
                  label="Continuar com Google"
                  pending={googlePending}
                  disabled={pending || isLoading}
                  onClick={() => void onGoogle()}
                />
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wider">
                    <span className="bg-card px-3 text-muted-foreground">ou cadastre com e-mail</span>
                  </div>
                </div>
              </div>

              <form onSubmit={(ev) => void onAccountSubmit(ev)} aria-busy={pending}>
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
                  <Button type="submit" className="h-11 flex-1 rounded-full sm:min-w-[12rem]" disabled={pending || googlePending}>
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
                <span className="font-medium text-foreground">{email.trim()}</span>. Confirme sua conta e depois faça
                login para entrar no painel.
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
