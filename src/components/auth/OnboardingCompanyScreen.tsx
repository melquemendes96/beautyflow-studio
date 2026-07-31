import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onboardingService } from "@/services/onboardingService";
import { useAuth } from "@/contexts/AuthProvider";
import {
  ensureUserCompanyBootstrap,
  getPendingStudioName,
  loadPostLoginProfile,
  resolvePostLoginDestination,
} from "@/lib/post-login";
import { navigateToAuthDestination } from "@/lib/auth-routing";
import { emptyLoginSearch } from "@/lib/challenge-60";
import { clearOAuthFlowContext } from "@/lib/oauth-signup-intent";

const SEGMENTS = [
  "Salão de beleza",
  "Studio de lash / sobrancelha",
  "Manicure / nail designer",
  "Estética",
  "Barbearia",
  "Autônoma",
  "Outro",
];

type ScreenPhase = "checking" | "needsForm" | "bootstrapping" | "redirecting" | "error";

const SAFETY_TIMEOUT_MS = 22_000;

export function OnboardingCompanyScreen() {
  const navigate = useNavigate();
  const { session, profileReady, refresh, signOut } = useAuth();
  const bootstrappedRef = useRef(false);
  const [phase, setPhase] = useState<ScreenPhase>("checking");
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [segment, setSegment] = useState("");
  const [document, setDocument] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState<string | null>(null);

  const goToDestination = useCallback(async () => {
    setPhase("redirecting");
    setError(null);
    const profile = await loadPostLoginProfile();
    const dest = await resolvePostLoginDestination({ profile });
    clearOAuthFlowContext();
    await refresh({ silent: true, full: true });
    await navigateToAuthDestination(navigate, dest, true);
  }, [navigate, refresh]);

  const runAutoBootstrap = useCallback(async () => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    setPhase("bootstrapping");
    setError(null);

    const pending = getPendingStudioName(session);
    if (!pending) {
      bootstrappedRef.current = false;
      setCompanyName((prev) => prev || "");
      setPhase("needsForm");
      return;
    }

    setCompanyName(pending);
    const boot = await ensureUserCompanyBootstrap({ companyName: pending, session });
    if (!boot.ok) {
      bootstrappedRef.current = false;
      setPhase(boot.code === "needs_company_name" ? "needsForm" : "error");
      setError(boot.error);
      return;
    }

    await goToDestination();
  }, [session, goToDestination]);

  useEffect(() => {
    if (!profileReady || !session) return;

    const pending = getPendingStudioName(session);
    if (pending) setCompanyName(pending);

    const safety = window.setTimeout(() => {
      setPhase((current) => {
        if (current === "checking" || current === "bootstrapping" || current === "redirecting") {
          setError("A operação demorou demais. Tente novamente ou preencha o formulário abaixo.");
          return "error";
        }
        return current;
      });
      bootstrappedRef.current = false;
    }, SAFETY_TIMEOUT_MS);

    void (async () => {
      try {
        const profile = await loadPostLoginProfile();
        if (profile.companyMemberships.length > 0) {
          await goToDestination();
          return;
        }
        if (pending) {
          await runAutoBootstrap();
          return;
        }
        setPhase("needsForm");
      } catch (e) {
        bootstrappedRef.current = false;
        setPhase("error");
        setError(e instanceof Error ? e.message : "Erro ao carregar seus dados.");
      }
    })();

    return () => window.clearTimeout(safety);
  }, [profileReady, session, goToDestination, runAutoBootstrap]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (companyName.trim().length < 2) {
      setError("Informe o nome da empresa (mínimo 2 caracteres).");
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    setPhase("bootstrapping");

    try {
      const res = await onboardingService.completeCompanyOnboarding({
        companyName: companyName.trim(),
        ownerName: ownerName.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        segment: segment || undefined,
        document: document.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
      });
      const data = res.data as { ok?: boolean; error?: string } | null;
      if (res.error || data?.ok === false) {
        bootstrappedRef.current = false;
        setPhase("error");
        setError(
          res.error?.message ||
            (data?.error === "unauthorized"
              ? "Sessão expirada. Faça login novamente."
              : "Não foi possível salvar sua empresa. Tente novamente."),
        );
        return;
      }
      await goToDestination();
    } catch (err) {
      bootstrappedRef.current = false;
      setPhase("error");
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    }
  };

  const showForm = phase === "needsForm" || phase === "error";
  const showLoader = phase === "checking" || phase === "bootstrapping" || phase === "redirecting";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-6 py-4">
        <Logo onLight className="h-12 max-w-[220px]" />
      </header>

      <main className="container-page flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-elegant">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <Building2 className="size-6" />
          </div>

          {showLoader && (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto size-8 animate-spin text-gold" aria-hidden />
              <h1 className="mt-4 font-display text-xl">
                {phase === "redirecting" ? "Redirecionando para o painel…" : "Preparando sua empresa…"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Isso leva poucos segundos. Não feche esta página.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-6 rounded-full"
                onClick={() => {
                  bootstrappedRef.current = false;
                  setPhase("needsForm");
                  setError(null);
                }}
              >
                Preencher manualmente
              </Button>
            </div>
          )}

          {showForm && (
            <>
              <h1 className="font-display text-2xl tracking-tight">Configure sua empresa</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Informe os dados do seu negócio para acessar o painel BeautyFlow.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        bootstrappedRef.current = false;
                        setError(null);
                        void runAutoBootstrap();
                      }}
                    >
                      Tentar novamente
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => void signOut().then(() => navigate({ to: "/login", search: emptyLoginSearch }))}
                    >
                      Sair e entrar de novo
                    </Button>
                  </div>
                </div>
              )}

              <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Nome da empresa *
                  </span>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    placeholder="Ex.: Studio Joyce Mendes"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Nome do responsável
                  </span>
                  <Input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">WhatsApp</span>
                  <Input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Segmento</span>
                  <select
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">Selecione…</option>
                    {SEGMENTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">CPF/CNPJ</span>
                    <Input value={document} onChange={(e) => setDocument(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Cidade</span>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </label>
                </div>
                <label className="block sm:max-w-[120px]">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">UF</span>
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                    placeholder="SP"
                  />
                </label>

                <Button type="submit" className="mt-2 w-full rounded-full" disabled={phase === "bootstrapping"}>
                  {phase === "bootstrapping" ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    "Entrar no painel"
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/login" search={emptyLoginSearch} className="font-medium text-foreground underline-offset-4 hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}



