import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { Loader2 } from "lucide-react";

type AuthSessionGateProps = {
  children: ReactNode;
  showGlobalLoader?: boolean;
};

export function AuthSessionGate({ children, showGlobalLoader = true }: AuthSessionGateProps) {
  const { isLoading } = useAuth();

  if (isLoading && showGlobalLoader) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-8 animate-spin text-gold" />
        <p className="text-sm text-muted-foreground">Validando sua sessão…</p>
      </div>
    );
  }

  return <>{children}</>;
}
