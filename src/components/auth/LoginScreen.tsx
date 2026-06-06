import { useEffect, useState } from "react";
import { navigateAfterAuthenticatedSession } from "@/lib/complete-auth-onboarding";
import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { authService } from "@/services/authService";
import { getSupabaseKeyConfigurationError, isSupabaseConfigured } from "@/lib/supabaseClient";
import { clearOAuthFlowContext, saveOAuthFlowContext } from "@/lib/oauth-signup-intent";
import { useAuth } from "@/contexts/AuthProvider";
import { isMasterAccount } from "@/lib/auth-profile";
import { usePublicAuthRedirect } from "@/lib/use-public-auth-redirect";
import { Lock, Mail } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

type LoginScreenProps = {
  /** Rota de voltar no link inferior (padrão: home) */
  backTo?: "/" | "/login";
  /** Se informado, após login com acesso ao painel empresa, abre checkout desse plano. */
  planId?: string;
};

export function LoginScreen({ backTo = "/", planId }: LoginScreenProps) {
  const navigate = useNavigate();
  const {
    session,
    profileReady,
    isPlatformAdmin,
    authConfigError,
    refresh: refreshAuth,
  } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  usePublicAuthRedirect(planId);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const formDisabled = pending || googlePending || redirecting;

  useEffect(() => {
    const configErr = authConfigError ?? getSupabaseKeyConfigurationError();
    if (configErr) {
      setError(configErr);
    }
  }, [authConfigError]);

  useEffect(() => () => setRedirecting(false), []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (JWT eyJ...) no .env e reinicie o npm run dev.",
      );
      return;
    }
    setPending(true);
    let timeout: ReturnType<typeof window.setTimeout> | undefined;
    try {
      clearOAuthFlowContext();
      const { error: signError } = await authService.signInWithPassword(email.trim(), password);
      if (signError) {
        setError("E-mail ou senha inválidos. Tente novamente.");
        return;
      }
      setRedirecting(true);
      timeout = window.setTimeout(() => {
        setRedirecting(false);
        setError("O login demorou demais. Tente novamente.");
      }, 22_000);
      const res = await navigateAfterAuthenticatedSession({
        navigate,
        planId,
        refreshAuth,
      });
      if (!res.ok) setError(res.error);
    } catch {
      setError("Erro inesperado ao entrar. Tente novamente.");
    } finally {
      if (timeout) window.clearTimeout(timeout);
      setPending(false);
      setRedirecting(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Configure o Supabase no .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY eyJ...) e reinicie o servidor.",
      );
      return;
    }
    setGooglePending(true);
    try {
      saveOAuthFlowContext({
        mode: "login",
        companyName: "",
        planId,
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

  return (
    <div
      className="relative grid min-h-screen lg:grid-cols-2"
      style={{ background: "var(--gradient-hero)" }}
    >
      {redirecting && (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-[2px]"
          aria-hidden
        >
          <p className="rounded-full bg-card px-4 py-2 text-sm shadow-elegant">Redirecionando…</p>
        </div>
      )}
      <div
        className="hidden flex-col justify-between p-12 text-background lg:flex"
        style={{ background: "var(--charcoal)" }}
      >
        <Logo className="h-32 w-auto max-w-[min(100%,20rem)] sm:h-36 sm:max-w-[24rem] lg:h-40 lg:max-w-[28rem]" />
        <div>
          <div className="font-display text-4xl leading-tight">Sua agenda, sua marca, suas regras.</div>
          <p className="mt-3 max-w-md text-background/70">
            Acesse o painel BeautyFlow e veja em tempo real tudo o que acontece no seu studio.
          </p>
          <ul className="mt-8 max-w-md space-y-3 text-sm text-background/65">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
              Agenda online com a cara da sua marca
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
              Lembretes e área da cliente
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
              Dados protegidos com criptografia em trânsito
            </li>
          </ul>
        </div>
        <div className="text-xs text-background/40">© 2026 JM BeautyFlow</div>
      </div>

      <div className="relative z-10 flex items-center justify-center p-6">
        <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-elegant">
          <div className="mb-6 lg:hidden">
            <Logo onLight className="h-14 max-w-[260px]" />
          </div>
          <h1 className="font-display text-2xl tracking-tight">Entrar no painel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bem-vinda de volta. Use e-mail e senha ou Google com o mesmo e-mail do cadastro.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <p>{error}</p>
              {(error.includes("Nenhum studio") ||
                error.includes("nome do studio") ||
                error.includes("nome do negócio") ||
                error.includes("chave anon")) &&
                !isMasterAccount(session) && (
                <Link
                  to="/cadastro"
                  search={planId ? { planId } : {}}
                  className="mt-2 inline-block font-medium underline underline-offset-2"
                >
                  Criar conta com nome do studio →
                </Link>
              )}
            </div>
          )}

          <div className="mt-6">
            <GoogleOAuthButton
              label="Continuar com Google"
              pending={googlePending}
              disabled={formDisabled}
              onClick={() => void onGoogle()}
            />
            <div className="relative my-6">
              <div className="pointer-events-none absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-card px-3 text-muted-foreground">ou e-mail</span>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="relative z-10" noValidate>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    disabled={formDisabled}
                    required
                    className="relative z-10 w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30 disabled:opacity-60"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <PasswordInput
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    disabled={formDisabled}
                    required
                    toggleLabel="senha de login"
                    className="relative z-10 h-auto rounded-xl border border-input bg-background py-3 pl-10 pr-11 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30 disabled:opacity-60"
                  />
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={formDisabled}
              className="mt-6 w-full rounded-full bg-foreground py-3.5 text-sm font-medium text-background shadow-soft transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Entrando…" : redirecting ? "Redirecionando…" : "Entrar no painel"}
            </button>
          </form>

          <div className="mt-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={backTo} className="text-muted-foreground hover:text-foreground">
                ← Voltar
              </Link>
              <Link
                to="/cadastro"
                search={planId ? { planId } : {}}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Criar conta
              </Link>
            </div>
            <p className="text-center text-muted-foreground sm:text-left">
              <Link to="/forgot-password" className="hover:text-foreground hover:underline">
                Esqueci minha senha
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
