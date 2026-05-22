import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/authService";
import {
  cleanPasswordRecoveryUrlFromAddressBar,
  completePasswordRecoveryFromUrl,
} from "@/lib/password-recovery";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Nova senha — JM BeautyFlow" }],
  }),
  component: ResetPasswordPage,
});

function passwordMeetsPolicy(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /\d/.test(pw)
  );
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const res = await completePasswordRecoveryFromUrl();
      cleanPasswordRecoveryUrlFromAddressBar();
      if (!res.session) {
        setLoadError(res.error ?? "Link inválido ou expirado.");
        return;
      }
      setReady(true);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordMeetsPolicy(password)) {
      toast.error("Use pelo menos 8 caracteres, com maiúscula, minúscula e número.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setPending(true);
    try {
      const { error } = await authService.updatePassword(password);
      if (error) {
        toast.error("Não foi possível salvar a nova senha. Solicite um novo link.");
        return;
      }
      setDone(true);
      toast.success("Senha atualizada com sucesso.");
      await authService.signOut();
      setTimeout(() => {
        void navigate({ to: "/login", replace: true });
      }, 1500);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-elegant">
        <Logo onLight className="mx-auto h-12 max-w-[220px]" />

        {loadError ? (
          <>
            <h1 className="mt-6 text-center font-display text-2xl">Link inválido</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground" role="alert">
              {loadError}
            </p>
            <Button asChild className="mt-6 w-full rounded-full">
              <Link to="/forgot-password">Solicitar novo link</Link>
            </Button>
          </>
        ) : !ready ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-gold" aria-hidden />
            <p className="text-sm">Validando link…</p>
          </div>
        ) : done ? (
          <>
            <h1 className="mt-6 text-center font-display text-2xl">Senha atualizada</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Sua nova senha foi salva. Você será redirecionado para o login.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center font-display text-2xl">Nova senha</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Escolha uma senha forte para proteger sua conta.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Nova senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={pending}
                    required
                    autoComplete="new-password"
                    toggleLabel="nova senha"
                    className="pl-10"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Confirmar senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                  <PasswordInput
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={pending}
                    required
                    autoComplete="new-password"
                    toggleLabel="confirmação de senha"
                    className="pl-10"
                  />
                </div>
              </label>
              <Button type="submit" className="w-full rounded-full" disabled={pending}>
                {pending ? "Salvando…" : "Salvar nova senha"}
              </Button>
            </form>
          </>
        )}

        <Link
          to="/login"
          className="mt-6 block text-center text-sm font-medium text-foreground underline underline-offset-4"
        >
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
