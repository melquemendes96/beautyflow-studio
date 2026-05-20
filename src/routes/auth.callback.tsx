import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/contexts/AuthProvider";
import { navigateAfterAuthenticatedSession } from "@/lib/complete-auth-onboarding";
import { cleanOAuthUrlFromAddressBar, completeOAuthFromUrl } from "@/lib/oauth-callback";
import {
  clearOAuthFlowContext,
  readOAuthFlowContext,
} from "@/lib/oauth-signup-intent";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = Route.useNavigate();
  const { refresh: refreshAuth } = useAuth();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const oauth = await completeOAuthFromUrl();
      cleanOAuthUrlFromAddressBar();

      if (!oauth.session) {
        setError(oauth.error ?? "Não foi possível concluir o login com Google.");
        return;
      }

      const ctx = readOAuthFlowContext();
      const res = await navigateAfterAuthenticatedSession({
        navigate,
        planId: ctx?.planId,
        companyName: ctx?.mode === "signup" ? ctx.companyName : null,
        refreshAuth: () => refreshAuth({ silent: false, waitForSession: false, full: true }),
        preferTrial: ctx?.mode === "signup",
      });

      clearOAuthFlowContext();

      if (!res.ok) {
        setError(res.error);
      }
    })();
  }, [navigate, refreshAuth]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <Logo onLight className="mx-auto h-12 max-w-[240px]" />
        {error ? (
          <>
            <h1 className="mt-6 font-display text-xl">Não foi possível entrar</h1>
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background"
            >
              Voltar para login
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mt-6 size-8 animate-spin text-gold" aria-hidden />
            <h1 className="mt-4 font-display text-xl">Finalizando login…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Aguarde, estamos validando sua conta Google.</p>
          </>
        )}
      </div>
    </div>
  );
}
