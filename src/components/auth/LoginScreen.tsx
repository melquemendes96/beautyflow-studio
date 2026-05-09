import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { authService } from "@/services/authService";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { navigateAfterAuthenticatedSession } from "@/lib/complete-auth-onboarding";
import {
  clearOAuthFlowContext,
  readOAuthFlowContext,
  saveOAuthFlowContext,
} from "@/lib/oauth-signup-intent";
import { useAuth } from "@/contexts/AuthProvider";
import { Lock, Mail } from "lucide-react";

type LoginScreenProps = {
  /** Rota de voltar no link inferior (padrão: home) */
  backTo?: "/" | "/login";
  /** Se informado, após login com acesso ao painel empresa, abre checkout desse plano. */
  planId?: string;
};

export function LoginScreen({ backTo = "/", planId }: LoginScreenProps) {
  const navigate = useNavigate();
  const { session, isLoading: authLoading, refresh: refreshAuth } = useAuth();
  const oauthHandledRef = useRef(false);

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  useEffect(() => {
    const c = readOAuthFlowContext();
    if (c?.mode === "signup") clearOAuthFlowContext();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || authLoading || !session) return;
    const ctx = readOAuthFlowContext();
    if (!ctx || ctx.mode !== "login") return;
    if (oauthHandledRef.current) return;
    oauthHandledRef.current = true;
    setError(null);

    void (async () => {
      const res = await navigateAfterAuthenticatedSession({
        navigate,
        planId: ctx.planId ?? planId,
        companyName: ctx.companyName,
        refreshAuth,
      });
      if (!res.ok) {
        oauthHandledRef.current = false;
        setError(res.error);
        return;
      }
      clearOAuthFlowContext();
    })();
  }, [session, authLoading, planId, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Crie o arquivo .env na raiz do projeto com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY). Valores em: Supabase → Configurações do projeto → API. Depois reinicie o npm run dev.",
      );
      return;
    }
    setPending(true);
    try {
      clearOAuthFlowContext();
      const { error: signError } = await authService.signInWithPassword(email.trim(), password);
      if (signError) {
        setError("E-mail ou senha inválidos. Tente novamente.");
        return;
      }
      const res = await navigateAfterAuthenticatedSession({
        navigate,
        planId,
        companyName: companyName.trim() ? companyName.trim() : null,
        refreshAuth,
      });
      if (!res.ok) setError(res.error);
    } finally {
      setPending(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Configure o Supabase no arquivo .env (VITE_SUPABASE_URL e chave pública) e reinicie o servidor.",
      );
      return;
    }
    setGooglePending(true);
    try {
      const base = window.location.origin;
      const loginUrl = planId ? `${base}/login?planId=${encodeURIComponent(planId)}` : `${base}/login`;
      saveOAuthFlowContext({
        mode: "login",
        companyName: companyName.trim(),
        planId,
      });
      const { data, error: oErr } = await authService.signInWithGoogle(loginUrl);
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
      className="grid min-h-screen lg:grid-cols-2"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div
        className="hidden flex-col justify-between p-12 text-background lg:flex"
        style={{ background: "var(--charcoal)" }}
      >
        <Logo className="h-10 brightness-0 invert" />
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

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-elegant">
          <div className="mb-6 lg:hidden">
            <Logo className="h-10" />
          </div>
          <h1 className="font-display text-2xl tracking-tight">Entrar no painel</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bem-vinda de volta. Acesse seu studio.</p>

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
                <span className="bg-card px-3 text-muted-foreground">ou e-mail</span>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void onSubmit(e)} aria-busy={pending}>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nome do studio (se for seu primeiro acesso)
                </span>
                <input
                  value={companyName}
                  onChange={(ev) => setCompanyName(ev.target.value)}
                  placeholder="Ex.: Joyce Mendes Beauty"
                  autoComplete="organization"
                  className="w-full rounded-xl border border-input bg-background py-3 px-4 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</span>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    required
                    className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Senha</span>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    required
                    aria-invalid={error ? true : undefined}
                    className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
                  />
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={pending || googlePending}
              className="mt-6 w-full rounded-full bg-foreground py-3.5 text-sm font-medium text-background shadow-soft transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Entrando…" : "Entrar no painel"}
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
            <p className="text-center text-muted-foreground sm:text-left">Recuperação de senha em breve</p>
          </div>
        </div>
      </div>
    </div>
  );
}
