import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BrandedImage } from "@/components/booking/BrandedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  displayStudioName,
  normalizeHexColor,
  type CompanyBranding,
} from "@/lib/branding-utils";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";
import { anamnesisService, type AnamnesisField } from "@/services/anamnesisService";
import { Check, Lock, Shield } from "lucide-react";
import { toast } from "sonner";

type Search = { t?: string };

export const Route = createFileRoute("/anamnese/$slug")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    t: typeof search.t === "string" ? search.t.trim() : undefined,
  }),
  component: AnamnesePage,
});

type Step = "auth" | "otp" | "form" | "password_offer" | "done";

const SESSION_KEY = "bf_anamnesis_session_v1";

function readStoredSession(slug: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { slug?: string; token?: string };
    if (parsed.slug === slug && parsed.token) return parsed.token;
  } catch {
    /* ignore */
  }
  return null;
}

function storeSession(slug: string, token: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ slug, token }));
}

function clearSession() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}

function AnamnesePage() {
  const { slug: rawSlug } = Route.useParams();
  const { t: accessToken } = Route.useSearch();
  const slug = normalizePublicBookingSlug(rawSlug);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("auth");
  const [busy, setBusy] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<any>(null);
  const [formData, setFormData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);
  const [authMode, setAuthMode] = useState<"otp" | "password">("otp");
  const [error, setError] = useState<string | null>(null);

  const branding = (bootstrap?.branding ?? null) as CompanyBranding | null;
  const company = bootstrap?.company;
  const studioName = displayStudioName(company, branding);
  const primary = normalizeHexColor(branding?.primary_color, "#1a1a1a");
  const secondary = normalizeHexColor(branding?.secondary_color, "#c9a960");

  const fields: AnamnesisField[] = useMemo(() => {
    const raw = formData?.template?.schema?.fields;
    if (!Array.isArray(raw)) return [];
    return raw as AnamnesisField[];
  }, [formData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await anamnesisService.getPageBootstrap(slug);
      if (cancelled) return;
      if (res.error || !(res.data as any)?.ok) {
        setError(
          String((res.data as any)?.error ?? res.error?.message ?? "recurso_indisponivel"),
        );
        return;
      }
      setBootstrap(res.data);

      if (accessToken) {
        setBusy(true);
        const redeem = await anamnesisService.redeemAccessToken(slug, accessToken);
        setBusy(false);
        const d = redeem.data as any;
        if (d?.ok && d.session_token) {
          storeSession(slug, d.session_token);
          setSessionToken(d.session_token);
          await loadForm(d.session_token);
          void navigate({
            to: "/anamnese/$slug",
            params: { slug },
            search: {},
            replace: true,
          });
          return;
        }
      }

      const stored = readStoredSession(slug);
      if (stored) {
        setSessionToken(stored);
        await loadForm(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, accessToken]);

  async function loadForm(token: string, opts?: { offerPassword?: boolean }) {
    setBusy(true);
    setError(null);
    const res = await anamnesisService.getForm(token);
    setBusy(false);
    const d = res.data as any;
    if (!d?.ok) {
      clearSession();
      setSessionToken(null);
      setStep("auth");
      setError(mapError(d?.error ?? "sessao_invalida"));
      return;
    }
    setFormData(d);
    const initial: Record<string, string | boolean> = {};
    for (const f of (d.template?.schema?.fields ?? []) as AnamnesisField[]) {
      initial[f.id] = f.type === "boolean" ? false : "";
    }
    setAnswers(initial);
    setStep(opts?.offerPassword ? "password_offer" : "form");
  }

  async function onRequestOtp() {
    setBusy(true);
    setError(null);
    const res = await anamnesisService.requestOtp(slug, whatsapp);
    setBusy(false);
    const d = res.data as any;
    if (!d?.ok) {
      setError(mapError(d?.error, d?.hint));
      return;
    }
    toast.success("Código enviado no WhatsApp.");
    setStep("otp");
  }

  async function onVerifyOtp() {
    setBusy(true);
    setError(null);
    const res = await anamnesisService.verifyOtp(slug, whatsapp, otp);
    setBusy(false);
    const d = res.data as any;
    if (!d?.ok || !d.session_token) {
      setError(mapError(d?.error));
      return;
    }
    storeSession(slug, d.session_token);
    setSessionToken(d.session_token);
    await loadForm(d.session_token, { offerPassword: !d.has_password });
  }

  async function onLoginPassword() {
    setBusy(true);
    setError(null);
    const res = await anamnesisService.loginPassword(slug, whatsapp, password);
    setBusy(false);
    const d = res.data as any;
    if (!d?.ok || !d.session_token) {
      setError(mapError(d?.error));
      return;
    }
    storeSession(slug, d.session_token);
    setSessionToken(d.session_token);
    await loadForm(d.session_token);
  }

  async function onSavePassword() {
    if (!sessionToken) return;
    if (newPassword.trim().length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    const res = await anamnesisService.setPassword(sessionToken, newPassword);
    setBusy(false);
    if (!(res.data as any)?.ok) {
      setError(mapError((res.data as any)?.error));
      return;
    }
    toast.success("Senha salva para este salão.");
    setStep("form");
  }

  async function onSubmitForm() {
    if (!sessionToken) return;
    for (const f of fields) {
      if (!f.required) continue;
      const v = answers[f.id];
      if (f.type === "boolean") continue;
      if (v == null || String(v).trim() === "") {
        setError(`Preencha: ${f.label}`);
        return;
      }
    }
    if (!consent) {
      setError("Confirme o consentimento para enviar a ficha.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await anamnesisService.submit(sessionToken, answers, true);
    setBusy(false);
    if (!(res.data as any)?.ok) {
      setError(mapError((res.data as any)?.error));
      return;
    }
    setStep("done");
  }

  if (error && !bootstrap && step === "auth") {
    return (
      <Centered>
        <h1 className="font-display text-2xl">Anamnese indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">{mapError(error)}</p>
      </Centered>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(165deg, ${primary}10 0%, #f7f4ef 40%, ${secondary}18 100%)`,
      }}
    >
      <header className="border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          {branding?.logo_url ? (
            <div className="grid size-12 place-items-center overflow-hidden rounded-xl border bg-white p-1">
              <BrandedImage src={branding.logo_url} alt={studioName} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div
              className="grid size-12 place-items-center rounded-xl text-sm font-semibold text-white"
              style={{ background: primary }}
            >
              {studioName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-display text-lg leading-tight">{studioName}</div>
            <div className="text-xs text-muted-foreground">Ficha de anamnese</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        {step === "auth" || step === "otp" ? (
          <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="size-4" style={{ color: primary }} />
              Acesso seguro — só você e o salão veem esta ficha
            </div>
            <h1 className="font-display text-2xl">Identifique-se</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use o WhatsApp cadastrado neste salão. Enviaremos um código ou você pode entrar com a senha deste
              salão.
            </p>

            <div className="mt-4 flex gap-2 text-xs">
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 ${authMode === "otp" ? "bg-foreground text-background" : "border"}`}
                onClick={() => setAuthMode("otp")}
              >
                Código WhatsApp
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 ${authMode === "password" ? "bg-foreground text-background" : "border"}`}
                onClick={() => setAuthMode("password")}
              >
                Senha deste salão
              </button>
            </div>

            <label className="mt-5 grid gap-1.5 text-sm">
              WhatsApp
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
            </label>

            {authMode === "password" ? (
              <label className="mt-3 grid gap-1.5 text-sm">
                Senha
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha neste salão"
                />
              </label>
            ) : null}

            {step === "otp" ? (
              <label className="mt-3 grid gap-1.5 text-sm">
                Código recebido
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                />
              </label>
            ) : null}

            {error ? (
              <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              {authMode === "otp" && step === "auth" ? (
                <Button disabled={busy || !whatsapp.trim()} onClick={() => void onRequestOtp()} style={{ background: primary }}>
                  {busy ? "Enviando…" : "Enviar código"}
                </Button>
              ) : null}
              {authMode === "otp" && step === "otp" ? (
                <>
                  <Button disabled={busy || otp.length < 4} onClick={() => void onVerifyOtp()} style={{ background: primary }}>
                    {busy ? "Validando…" : "Confirmar código"}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void onRequestOtp()}>
                    Reenviar código
                  </Button>
                </>
              ) : null}
              {authMode === "password" ? (
                <Button disabled={busy || !whatsapp.trim() || password.length < 6} onClick={() => void onLoginPassword()} style={{ background: primary }}>
                  {busy ? "Entrando…" : "Entrar"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === "password_offer" ? (
          <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Lock className="size-4" style={{ color: primary }} />
              <h1 className="font-display text-xl">Criar senha (opcional)</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Assim você não precisa do código WhatsApp toda vez neste salão. Pode pular e continuar.
            </p>
            <label className="mt-4 grid gap-1.5 text-sm">
              Nova senha (mín. 6)
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            <div className="mt-5 flex flex-col gap-2">
              <Button disabled={busy} onClick={() => void onSavePassword()} style={{ background: primary }}>
                Salvar senha e continuar
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setStep("form")}>
                Pular por agora
              </Button>
            </div>
          </div>
        ) : null}

        {step === "form" && formData ? (
          <div className="rounded-3xl border border-border/60 bg-white/95 p-6 shadow-sm">
            <h1 className="font-display text-2xl">{formData.template?.name ?? "Anamnese"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Olá, {formData.client?.name ?? "cliente"}. Responda com atenção — o profissional usará estas
              informações no seu atendimento.
            </p>
            {formData.anamnesis_valid ? (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Você já tem uma ficha válida. Enviar novamente atualiza o histórico.
              </p>
            ) : null}

            <div className="mt-5 space-y-4">
              {fields.map((f) => (
                <label key={f.id} className="grid gap-1.5 text-sm">
                  <span>
                    {f.label}
                    {f.required ? <span className="text-destructive"> *</span> : null}
                  </span>
                  {f.type === "boolean" ? (
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={answers[f.id] === true ? "sim" : "nao"}
                      onChange={(e) => setAnswers((s) => ({ ...s, [f.id]: e.target.value === "sim" }))}
                    >
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  ) : (
                    <Input
                      value={String(answers[f.id] ?? "")}
                      onChange={(e) => setAnswers((s) => ({ ...s, [f.id]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>

            <label className="mt-5 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
              <span>
                Autorizo o salão <strong>{studioName}</strong> a utilizar estas informações exclusivamente para meu
                atendimento e segurança do procedimento.
              </span>
            </label>

            {error ? (
              <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button className="mt-5 w-full" disabled={busy} onClick={() => void onSubmitForm()} style={{ background: primary }}>
              {busy ? "Enviando…" : "Enviar anamnese"}
            </Button>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="rounded-3xl border border-border/60 bg-white/95 p-8 text-center shadow-sm">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100">
              <Check className="size-7 text-emerald-700" />
            </div>
            <h1 className="mt-4 font-display text-2xl">Ficha enviada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O {studioName} já recebeu sua anamnese. Obrigado!
            </p>
            <Button className="mt-6" variant="outline" onClick={() => void navigate({ to: "/agendar/$slug", params: { slug } })}>
              Voltar ao agendamento
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center px-4 text-center">{children}</div>;
}

function mapError(code?: string, hint?: string): string {
  const map: Record<string, string> = {
    slug_obrigatorio: "Link inválido.",
    empresa_nao_encontrada: "Salão não encontrado.",
    recurso_indisponivel: "Este salão ainda não liberou a anamnese no plano.",
    whatsapp_invalido: "Informe um WhatsApp válido.",
    cliente_nao_encontrado: "Não encontramos este WhatsApp neste salão. Agenda primeiro ou confira o número.",
    muitas_tentativas: "Muitas tentativas. Aguarde alguns minutos.",
    whatsapp_indisponivel:
      hint ||
      "WhatsApp oficial do salão indisponível. Use o link seguro do agendamento ou a senha, se já tiver.",
    codigo_invalido: "Código inválido.",
    codigo_expirado: "Código expirado. Solicite outro.",
    token_invalido: "Link expirado ou inválido. Peça um novo ao salão.",
    credenciais_invalidas: "WhatsApp ou senha incorretos.",
    sessao_invalida: "Sessão expirada. Entre novamente.",
    senha_fraca: "Senha muito curta (mínimo 6).",
    consentimento_obrigatorio: "É necessário aceitar o consentimento.",
    respostas_invalidas: "Revise as respostas.",
  };
  if (!code) return "Não foi possível continuar.";
  return map[code] ?? (hint || code);
}
