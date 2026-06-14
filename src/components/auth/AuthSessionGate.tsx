import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthProvider";
import { isPublicAuthPath } from "@/lib/public-routes";
import { Loader2 } from "lucide-react";

type AuthSessionGateProps = {
  children: ReactNode;
};

/**
 * Em rotas públicas (/login, /cadastro, /, etc.) nunca bloqueia a UI.
 * Em rotas protegidas, mostra loader curto com botão de retry.
 */
export function AuthSessionGate({ children }: AuthSessionGateProps) {
  const { isLoading, profileReady, session, authConfigError, refresh } = useAuth();
  const { pathname } = useLocation();

  const isPublic = isPublicAuthPath(pathname);
  const canRender = isPublic || (!isLoading && (!session || profileReady));

  if (canRender) {
    return <>{children}</>;
  }

  return (
    <div
      className="flex min-h-dvh min-w-0 flex-col items-center justify-center gap-4 overflow-x-clip bg-background px-4"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-gold" />
      <p className="text-sm text-muted-foreground">Verificando sua sessão…</p>
      {authConfigError && (
        <p className="max-w-sm text-center text-sm text-destructive">{authConfigError}</p>
      )}
      <button
        type="button"
        onClick={() => void refresh({ silent: false })}
        className="text-sm font-medium text-foreground underline underline-offset-4"
      >
        Tentar novamente
      </button>
    </div>
  );
}
