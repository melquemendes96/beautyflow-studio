import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, Mail, Sparkles, Building2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { authService } from "@/services/authService";
import { subscriptionService } from "@/services/subscriptionService";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthProvider";
import {
  clearOAuthFlowContext,
  appendStudioNameToRedirectUrl,
  readOAuthFlowContext,
  readStudioNameFromUrl,
  saveOAuthFlowContext,
} from "@/lib/oauth-signup-intent";
import { navigateAfterAuthenticatedSession } from "@/lib/complete-auth-onboarding";
import { guardPublicAuthRoute } from "@/lib/route-guards";
import { useAuthenticatedPanelRedirect } from "@/lib/use-authenticated-panel-redirect";

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
  beforeLoad: async ({ search }) => {
    await guardPublicAuthRoute(search.planId);
  },
  component: Cadastro,
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

function Cadastro() {
  const { planId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    session,
    isLoading: authLoading,
    isPlatformAdmin,
    companyMemberships,
    refresh: refreshAuth,
  } = useAuth();
  const oauthHandledRef = useRef(false);

  useAuthenticatedPanelRedirect(planId);

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
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || authLoading || !session) return;
    if (isPlatformAdmin || companyMemberships.length > 0) return;

    const ctx = readOAuthFlowContext();
    if (!ctx || ctx.mode !== "signup") return;
    if (oauthHandledRef.current) return;
    oauthHandledRef.current = true;
    setError(null);

    void (async () => {
      const res = await navigateAfterAuthenticatedSession({
        navigate,
        planId: ctx.planId ?? planId,
        companyName: ctx.companyName?.trim() ? ctx.companyName : null,
        refreshAuth,
      });
      if (!res.ok) {
        oauthHandledRef.current = false;
        if (res.code === "needs_company_name") {
          setStep("account");
        }
        setError(res.error);
        return;
      }
      clearOAuthFlowContext();
    })();
  }, [
    session,
    authLoading,
    isPlatformAdmin,
    companyMemberships.length,
    planId,
    navigate,
    refreshAuth,
  ]);

  const plansQuery = useQuery({
    queryKey: ["public", "plans"],
    queryFn: async () => {
      const res = await subscriptionService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    enabled: Boolean(planId),
  });

  const selectedPlan = useMemo(
    () =>
      (plansQuery.data ?? []).find((p: { id: string }) => String(p.id) === String(planId ?? "")) ?? null,
    [plansQuery.data, planId],
  );

  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const name = companyName.trim();
      const e = email.trim();
      if (name.length < 2) throw new Error("Informe o nome do studio (mínimo 2 caracteres).");
      if (!emailOk(e)) throw new Error("Digite um e-mail válido.");
      if (!passwordMeetsPolicy(password)) throw new Error("A senha não atende aos requisitos abaixo.");
      const loginBase = window.location.origin + "/login";
      const emailRedirectTo = planId ? `${loginBase}?planId=${encodeURIComponent(planId)}` : loginBase;
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
      const raw =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "";
      const msg =
        raw && raw.length > 0 ? raw : "Não foi possível criar sua conta. Tente novamente.";
      setError(msg.includes("429") ? "Muitas tentativas. Aguarde alguns minutos e tente novamente." : msg);
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
    clearOAuthFlowContext();
    if (!isSupabaseConfigured()) {
      setError(
        "Crie o arquivo .env na raiz do projeto com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY). Valores em: Supabase → Configurações do projeto → API. Depois reinicie o npm run dev.",
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
        "Configure o Supabase no arquivo .env (VITE_SUPABASE_URL e chave pública) e reinicie o servidor.",
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
      const base = window.location.origin;
      const cadastroBase = planId
        ? `${base}/cadastro?planId=${encodeURIComponent(planId)}`
        : `${base}/cadastro`;
      const cadastroUrl = appendStudioNameToRedirectUrl(cadastroBase, name);
      saveOAuthFlowContext({
        mode: "signup",
        companyName: name,
        planId,
      });
      const { data, error: oErr } = await authService.signInWithGoogle(cadastroUrl);
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
            Depois de criar a conta, você confirma o e-mail (se usar senha) e entra no painel para escolher o plano e
            personalizar sua página pública.
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
                Use Google ou e-mail. Em seguida você confirma o acesso e entra no painel.
              </p>

              {planId && (
                <div className="mt-5 rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
                  <div className="font-medium text-foreground">Plano escolhido</div>
                  {plansQuery.isLoading && (
                    <div className="mt-2 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  )}
                  {plansQuery.isError && (
                    <p className="mt-2 text-muted-foreground">
                      Não foi possível carregar os planos agora. Você ainda pode criar a conta; escolha o plano de novo
                      na página inicial se precisar.
                    </p>
                  )}
                  {!plansQuery.isLoading && !plansQuery.isError && selectedPlan && (
                    <p className="mt-2 text-muted-foreground">
                      {selectedPlan.name} · R$ {formatBrl(Number(selectedPlan.price ?? 0))}/mês
                    </p>
                  )}
                  {!plansQuery.isLoading && !plansQuery.isError && !selectedPlan && (
                    <p className="mt-2 text-muted-foreground">
                      Não encontramos esse plano. Volte à página inicial e selecione um plano válido.
                    </p>
                  )}
                </div>
              )}

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
                  disabled={pending || authLoading}
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
                      <Input
                        type="password"
                        name="password"
                        value={password}
                        onChange={(ev) => {
                          setPassword(ev.target.value);
                          if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                        }}
                        placeholder="Crie uma senha forte"
                        autoComplete="new-password"
                        required
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
                    {pending ? "Criando…" : "Criar conta e continuar"}
                  </Button>
                  <Button variant="outline" className="h-11 rounded-full" type="button" asChild>
                    <Link to="/login" search={planId ? { planId } : {}} className="inline-flex items-center justify-center">
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
                login para continuar.
              </p>

              <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                Seu studio será criado como <span className="font-medium text-foreground">{companyName.trim()}</span>{" "}
                no primeiro acesso ao painel.
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button className="h-11 rounded-full" type="button" asChild>
                  <Link to="/login" search={planId ? { planId } : {}} className="inline-flex items-center justify-center">
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
