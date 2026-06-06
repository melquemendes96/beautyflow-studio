import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Lock, Mail, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authService } from "@/services/authService";
import {
  formatProviderInviteError,
  providerInviteService,
} from "@/services/providerInviteService";
import { useAuth } from "@/contexts/AuthProvider";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { toast } from "sonner";

export const Route = createFileRoute("/convite/prestador/$token")({
  component: ProviderInvitePage,
});

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

function ProviderInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { session, refresh } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const acceptAttemptedRef = useRef(false);

  const previewQuery = useQuery({
    queryKey: ["provider-invite", "preview", token],
    enabled: Boolean(token) && isSupabaseConfigured(),
    retry: false,
    queryFn: async () => {
      const res = await providerInviteService.preview(token);
      if (res.error) throw res.error;
      const data = res.data;
      if (!data?.ok) throw new Error(formatProviderInviteError(data?.error));
      return data;
    },
  });

  useEffect(() => {
    const expected = previewQuery.data?.expected_email;
    if (expected) setEmail(expected);
  }, [previewQuery.data?.expected_email]);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await providerInviteService.accept(token);
      if (res.error) throw res.error;
      const data = res.data;
      if (!data?.ok) throw new Error(formatProviderInviteError(data?.error));
      return data;
    },
    onSuccess: async () => {
      toast.success("Acesso liberado! Bem-vindo(a) à equipe.");
      await refresh({ full: true });
      await navigate({ to: "/admin/agenda" });
    },
    onError: (e: Error) => {
      setError(e.message);
    },
  });

  const signupMutation = useMutation({
    mutationFn: async () => {
      if (!emailOk(email)) throw new Error("Informe um e-mail válido.");
      if (previewQuery.data?.expected_email && email.trim().toLowerCase() !== previewQuery.data.expected_email.toLowerCase()) {
        throw new Error(formatProviderInviteError("email_nao_confere"));
      }
      if (!passwordMeetsPolicy(password)) {
        throw new Error("Senha: 8+ caracteres, maiúscula, minúscula e número.");
      }
      if (password !== confirmPassword) throw new Error("As senhas não coincidem.");

      const { data, error: signUpError } = await authService.signUpWithPassword(email.trim(), password);
      if (signUpError) throw signUpError;
      if (!data.session) {
        throw new Error("Confirme seu e-mail pelo link enviado e abra este convite novamente.");
      }
      await refresh({ full: true, waitForSession: true });
      await acceptMutation.mutateAsync();
    },
    onError: (e: Error) => setError(e.message || "Não foi possível criar a conta."),
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!emailOk(email)) throw new Error("Informe um e-mail válido.");
      const { error: signInError } = await authService.signInWithPassword(email.trim(), password);
      if (signInError) throw new Error("E-mail ou senha inválidos.");
      await refresh({ full: true, waitForSession: true });
      await acceptMutation.mutateAsync();
    },
    onError: (e: Error) => setError(e.message || "Não foi possível entrar."),
  });

  useEffect(() => {
    if (!session?.user || previewQuery.isLoading || !previewQuery.data?.ok) return;
    if (acceptMutation.isPending || acceptMutation.isSuccess || acceptAttemptedRef.current) return;
    acceptAttemptedRef.current = true;
    void acceptMutation.mutate();
  }, [session?.user, previewQuery.isLoading, previewQuery.data?.ok, acceptMutation.isPending, acceptMutation.isSuccess]);

  const busy = signupMutation.isPending || loginMutation.isPending || acceptMutation.isPending;

  const previewError = useMemo(() => {
    if (previewQuery.isLoading) return null;
    if (previewQuery.error instanceof Error) return previewQuery.error.message;
    return null;
  }, [previewQuery.error, previewQuery.isLoading]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Supabase não configurado.</p>
      </div>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Validando convite…</p>
      </div>
    );
  }

  if (previewError || !previewQuery.data?.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
          <Logo onLight className="mx-auto h-11 max-w-[240px]" />
          <h1 className="mt-6 font-display text-xl">Convite indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{previewError ?? "Este link não pode ser usado."}</p>
          <Button className="mt-6" asChild>
            <Link to="/login">Ir para login</Link>
          </Button>
        </div>
      </div>
    );
  }

  const preview = previewQuery.data;

  return (
    <div className="min-h-screen bg-secondary/30 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <Logo onLight className="mx-auto h-11 max-w-[240px]" />
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant md:p-8">
          <div className="flex flex-col items-center text-center">
            {preview.provider_photo_url ? (
              <img
                src={preview.provider_photo_url}
                alt=""
                className="size-20 rounded-full object-cover ring-2 ring-gold/40"
              />
            ) : (
              <div className="grid size-20 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="size-8" />
              </div>
            )}
            <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Convite de equipe</p>
            <h1 className="mt-1 font-display text-2xl">{preview.provider_name}</h1>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-4" />
              {preview.company_name}
            </p>
          </div>

          {session?.user && acceptMutation.isPending ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">Vinculando sua conta…</p>
          ) : (
            <>
              <div className="mt-8 flex rounded-full border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-2 text-sm ${mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("signup")}
                  disabled={busy}
                >
                  Criar conta
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-2 text-sm ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("login")}
                  disabled={busy}
                >
                  Já tenho conta
                </button>
              </div>

              <form
                className="mt-6 grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  if (mode === "signup") signupMutation.mutate();
                  else loginMutation.mutate();
                }}
              >
                <label className="grid gap-1.5 text-sm">
                  E-mail
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      readOnly={Boolean(preview.expected_email)}
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </label>

                <label className="grid gap-1.5 text-sm">
                  Senha
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                    <PasswordInput
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </label>

                {mode === "signup" ? (
                  <label className="grid gap-1.5 text-sm">
                    Confirmar senha
                    <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </label>
                ) : null}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <Button type="submit" disabled={busy} className="w-full">
                  {busy
                    ? "Processando…"
                    : mode === "signup"
                      ? "Criar conta e entrar"
                      : "Entrar e vincular"}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Ao continuar, você terá acesso apenas à sua agenda neste studio.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
