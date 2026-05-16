import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onboardingService } from "@/services/onboardingService";
import { useAuth } from "@/contexts/AuthProvider";
import { navigateToAuthDestination, resolveAuthDestination } from "@/lib/auth-routing";

const SEGMENTS = [
  "Salão de beleza",
  "Studio de lash / sobrancelha",
  "Manicure / nail designer",
  "Estética",
  "Barbearia",
  "Autônoma",
  "Outro",
];

export function OnboardingCompanyScreen() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [segment, setSegment] = useState("");
  const [document, setDocument] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (companyName.trim().length < 2) {
      setError("Informe o nome da empresa (mínimo 2 caracteres).");
      return;
    }
    setPending(true);
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
        setError("Não foi possível salvar sua empresa. Tente novamente.");
        return;
      }
      await refresh();
      const dest = await resolveAuthDestination();
      await navigateToAuthDestination(navigate, dest);
    } finally {
      setPending(false);
    }
  };

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
          <h1 className="font-display text-2xl tracking-tight">Configure sua empresa</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Finalizando seu cadastro… Conte-nos sobre o seu negócio para liberar planos e o painel.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
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
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  CPF/CNPJ
                </span>
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

            <Button type="submit" className="mt-2 w-full rounded-full" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Continuar para planos"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
