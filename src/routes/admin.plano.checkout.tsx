import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery } from "@tanstack/react-query";
import { subscriptionService } from "@/services/subscriptionService";
import { checkoutService, type PaymentMethodPreference } from "@/services/checkoutService";
import { useAuth } from "@/contexts/AuthProvider";
import {
  digitsOnly,
  isValidBrazilPhone,
  isValidCep,
  isValidCpfOrCnpj,
  isValidEmail,
  isValidUf,
} from "@/lib/br-billing-validation";
import { maskBrazilPhoneInput, maskCepInput, maskCpfCnpjInput } from "@/lib/br-input-masks";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin/plano/checkout")({
  component: Checkout,
  validateSearch: (s: Record<string, unknown>) => {
    return {
      planId: typeof s.planId === "string" ? s.planId : "",
      trial: s.trial === "true" || s.trial === true || s.trial === "1",
      checkout: undefined as string | undefined,
      billing: undefined as string | undefined,
    };
  },
});

const PAYMENT_LABELS: Record<PaymentMethodPreference, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  boleto: "Boleto",
  manual_transfer: "Transferência bancária (manual)",
};

function usesMercadoPagoGateway(method: PaymentMethodPreference): boolean {
  return (
    method === "pix" ||
    method === "credit_card" ||
    method === "debit_card" ||
    method === "boleto"
  );
}

type BillingProfile = {
  legal_name: string;
  document: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
};

function validateBilling(profile: BillingProfile): Record<string, string> {
  const err: Record<string, string> = {};
  if (profile.legal_name.trim().length < 3) {
    err.legal_name = "Informe nome ou razão social (mín. 3 caracteres).";
  }
  if (!isValidCpfOrCnpj(profile.document)) {
    err.document = "Informe um CPF ou CNPJ válido (11 ou 14 dígitos).";
  }
  if (!isValidEmail(profile.email)) {
    err.email = "E-mail inválido.";
  }
  if (!isValidBrazilPhone(profile.phone)) {
    err.phone = "Telefone com DDD (10 ou 11 dígitos).";
  }
  if (profile.address_line1.trim().length < 4) {
    err.address_line1 = "Informe o endereço.";
  }
  if (profile.city.trim().length < 2) {
    err.city = "Informe a cidade.";
  }
  if (!isValidUf(profile.state)) {
    err.state = "UF com 2 letras (ex.: SP).";
  }
  const cep = digitsOnly(profile.postal_code);
  if (!isValidCep(cep)) {
    err.postal_code = "CEP com 8 dígitos.";
  }
  return err;
}

const STEPS = [
  { n: 1 as const, title: "Plano e pagamento" },
  { n: 2 as const, title: "Dados de cobrança" },
  { n: 3 as const, title: "Revisão" },
];

function Checkout() {
  const { user } = useAuth();
  const { companyId, hasCompany } = useCurrentCompany();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const userDefaultsApplied = useRef(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodPreference>("pix");
  const [profile, setProfile] = useState<BillingProfile>({
    legal_name: "",
    document: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || userDefaultsApplied.current) return;
    userDefaultsApplied.current = true;
    const metaName =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    setProfile((p) => ({
      ...p,
      email: p.email || user.email || "",
      legal_name: p.legal_name || metaName,
    }));
  }, [user]);

  const plansQuery = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const res = await subscriptionService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const plan = useMemo(
    () => (plansQuery.data ?? []).find((p: { id: string }) => p.id === search.planId) ?? null,
    [plansQuery.data, search.planId],
  );
  const planMissing = !plansQuery.isLoading && Boolean(search.planId) && !plan;

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      if (!search.planId) throw new Error("Plano inválido");
      const res = await checkoutService.startCheckout({
        companyId,
        planId: search.planId,
        paymentMethod,
        trial: Boolean(search.trial),
        billingProfile: {
          ...profile,
          state: profile.state.trim().toUpperCase(),
          document: digitsOnly(profile.document),
          postal_code: digitsOnly(profile.postal_code),
          phone: digitsOnly(profile.phone),
        },
      });
      if (res.error) throw res.error;
      return res.data as { ok?: boolean; error?: string; payment_id?: string | null };
    },
    onSuccess: async (d) => {
      if (d?.ok === false) {
        if (d?.error === "trial_ja_usado") {
          toast.error("Este studio já usou o teste grátis.");
          return;
        }
        if (d?.error === "troca_plano_bloqueada") {
          toast.error("Você só pode trocar de plano a cada 30 dias.");
          return;
        }
        toast.error("Não foi possível iniciar a assinatura.");
        return;
      }
      const pid = d?.payment_id;
      const payWithMp = usesMercadoPagoGateway(paymentMethod) && Boolean(pid);
      if (payWithMp) {
        const { data: mpData, error: fnError } = await checkoutService.createMercadoPagoCheckout({
          paymentId: pid as string,
        });
        if (fnError || !mpData?.url) {
          toast.error("Não foi possível abrir o checkout do Mercado Pago. Tente outro método ou fale com o suporte.");
          navigate({ to: "/admin/plano", search: { checkout: undefined, billing: undefined } });
          return;
        }
        window.location.href = mpData.url;
        return;
      }
      toast.success("Solicitação enviada. Vamos validar e liberar o acesso.");
      navigate({ to: "/admin/plano", search: { checkout: undefined, billing: undefined } });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível iniciar a assinatura.";
      toast.error(msg);
    },
  });

  const goNextFromBilling = () => {
    const errs = validateBilling(profile);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Corrija os campos destacados.");
      const first = document.querySelector("[data-checkout-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setStep(3);
  };

  const submitCheckout = () => {
    const errs = validateBilling(profile);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Corrija os dados antes de continuar.");
      setStep(2);
      return;
    }
    startMutation.mutate();
  };

  const canProceedStep1 = Boolean(search.planId) && !planMissing && !plansQuery.isLoading;
  const disableSubmit =
    !hasCompany || !search.planId || planMissing || plansQuery.isLoading || startMutation.isPending;

  const inputErr = (key: string) =>
    fieldErrors[key] ? (
      <p data-checkout-error="true" className="text-xs text-destructive" role="alert">
        {fieldErrors[key]}
      </p>
    ) : null;

  return (
    <div>
      <PageTitle
        title="Cobrança e pagamento"
        subtitle="Confirme o plano, preencha seus dados e finalize no Mercado Pago (PIX, cartão ou boleto)."
      />

      {plansQuery.isError && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os planos. Volte e tente novamente.
        </div>
      )}

      {!search.planId && !plansQuery.isLoading && (
        <div className="mb-6 rounded-2xl border border-dashed border-border bg-secondary/15 px-4 py-4 text-center text-sm text-muted-foreground">
          Nenhum plano selecionado.{" "}
          <Link
            to="/admin/plano"
            search={{ checkout: undefined, billing: undefined }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Escolher um plano
          </Link>
        </div>
      )}

      <nav aria-label="Etapas do checkout" className="mb-8">
        <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li key={s.n} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    done && "border-success bg-success/15 text-success",
                    active && "border-foreground bg-foreground text-background",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? <Check className="size-4" aria-hidden /> : s.n}
                </span>
                <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {s.title}
                </span>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="mx-1 hidden size-4 text-muted-foreground sm:block" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna esquerda: conteúdo da etapa */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          {step === 1 && (
            <>
              <h2 className="font-display text-lg">Plano e forma de pagamento</h2>
              <div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-4">
                {plansQuery.isLoading ? (
                  <>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-2 h-4 w-28" />
                  </>
                ) : planMissing ? (
                  <p className="text-sm text-destructive">
                    Este plano não está mais disponível. Escolha outro em &quot;Plano e assinatura&quot;.
                  </p>
                ) : (
                  <>
                    <div className="text-sm font-medium">{plan?.name ?? "—"}</div>
                    <div className="text-sm text-muted-foreground">
                      {plan ? `R$ ${Number(plan.price ?? 0).toFixed(2).replace(".", ",")}/mês` : "—"}
                      {search.trial ? " · Período de teste" : ""}
                    </div>
                  </>
                )}
              </div>

              {search.trial && (
                <p className="mt-3 text-sm text-muted-foreground">
                  No teste grátis você não paga agora; os dados da próxima etapa ajudam a ativar seu studio.
                </p>
              )}

              <div className="mt-4">
                <Label htmlFor="checkout-payment-method" className="text-xs text-muted-foreground">
                  Forma de pagamento (preferência)
                </Label>
                <select
                  id="checkout-payment-method"
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodPreference)}
                  disabled={plansQuery.isLoading || planMissing || !search.planId}
                >
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão de crédito</option>
                  <option value="debit_card">Cartão de débito</option>
                  <option value="boleto">Boleto</option>
                  <option value="manual_transfer">Transferência (manual)</option>
                </select>
              </div>

              <div className="mt-3 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                PIX, cartão e boleto: na etapa final você será enviado ao checkout seguro do Mercado Pago. A
                transferência manual segue análise do time Master.
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/admin/plano"
                  search={{ checkout: undefined, billing: undefined }}
                  className="inline-flex items-center justify-center rounded-full border border-border px-5 py-2.5 text-sm hover:bg-accent"
                >
                  Voltar
                </Link>
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={!canProceedStep1}
                  onClick={() => setStep(2)}
                >
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-lg">Dados de cobrança</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Os mesmos dados podem ser solicitados de novo no Mercado Pago por segurança.
              </p>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="legal_name">Razão social / Nome completo</Label>
                  <Input
                    id="legal_name"
                    autoComplete="organization"
                    aria-invalid={Boolean(fieldErrors.legal_name)}
                    value={profile.legal_name}
                    onChange={(e) => {
                      setProfile((s) => ({ ...s, legal_name: e.target.value }));
                      setFieldErrors((f) => {
                        const n = { ...f };
                        delete n.legal_name;
                        return n;
                      });
                    }}
                  />
                  {inputErr("legal_name")}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="document">CPF ou CNPJ</Label>
                  <Input
                    id="document"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.document)}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={profile.document}
                    onChange={(e) => {
                      setProfile((s) => ({ ...s, document: maskCpfCnpjInput(e.target.value) }));
                      setFieldErrors((f) => {
                        const n = { ...f };
                        delete n.document;
                        return n;
                      });
                    }}
                  />
                  {inputErr("document")}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      aria-invalid={Boolean(fieldErrors.email)}
                      value={profile.email}
                      onChange={(e) => {
                        setProfile((s) => ({ ...s, email: e.target.value }));
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.email;
                          return n;
                        });
                      }}
                    />
                    {inputErr("email")}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Telefone (com DDD)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      placeholder="(11) 99999-0000"
                      value={profile.phone}
                      onChange={(e) => {
                        setProfile((s) => ({ ...s, phone: maskBrazilPhoneInput(e.target.value) }));
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.phone;
                          return n;
                        });
                      }}
                    />
                    {inputErr("phone")}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="address_line1">Endereço</Label>
                  <Input
                    id="address_line1"
                    autoComplete="street-address"
                    aria-invalid={Boolean(fieldErrors.address_line1)}
                    value={profile.address_line1}
                    onChange={(e) => {
                      setProfile((s) => ({ ...s, address_line1: e.target.value }));
                      setFieldErrors((f) => {
                        const n = { ...f };
                        delete n.address_line1;
                        return n;
                      });
                    }}
                  />
                  {inputErr("address_line1")}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="address_line2">Complemento (opcional)</Label>
                  <Input
                    id="address_line2"
                    value={profile.address_line2}
                    onChange={(e) => setProfile((s) => ({ ...s, address_line2: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="grid gap-1.5 md:col-span-1">
                    <Label htmlFor="city">Cidade</Label>
                    <Input
                      id="city"
                      autoComplete="address-level2"
                      aria-invalid={Boolean(fieldErrors.city)}
                      value={profile.city}
                      onChange={(e) => {
                        setProfile((s) => ({ ...s, city: e.target.value }));
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.city;
                          return n;
                        });
                      }}
                    />
                    {inputErr("city")}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="state">UF</Label>
                    <Input
                      id="state"
                      maxLength={2}
                      autoComplete="address-level1"
                      className="uppercase"
                      aria-invalid={Boolean(fieldErrors.state)}
                      value={profile.state}
                      onChange={(e) => {
                        setProfile((s) => ({ ...s, state: e.target.value.toUpperCase() }));
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.state;
                          return n;
                        });
                      }}
                    />
                    {inputErr("state")}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="postal_code">CEP</Label>
                    <Input
                      id="postal_code"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      aria-invalid={Boolean(fieldErrors.postal_code)}
                      placeholder="00000-000"
                      value={profile.postal_code}
                      onChange={(e) => {
                        setProfile((s) => ({ ...s, postal_code: maskCepInput(e.target.value) }));
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.postal_code;
                          return n;
                        });
                      }}
                    />
                    {inputErr("postal_code")}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setStep(1)}>
                  Voltar
                </Button>
                <Button type="button" className="rounded-full" onClick={goNextFromBilling}>
                  Revisar e continuar
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-lg">Revisão</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Confira os dados antes de {search.trial ? "iniciar o teste" : "abrir o pagamento"}.
              </p>

              <dl className="mt-4 space-y-3 rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Plano</dt>
                  <dd className="font-medium">
                    {plan?.name ?? "—"}{" "}
                    {plan ? `· R$ ${Number(plan.price ?? 0).toFixed(2).replace(".", ",")}/mês` : ""}
                    {search.trial ? " (teste)" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Pagamento</dt>
                  <dd>{PAYMENT_LABELS[paymentMethod]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Nome / Razão</dt>
                  <dd>{profile.legal_name.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">CPF/CNPJ</dt>
                  <dd>{profile.document.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Contato</dt>
                  <dd>
                    {profile.email.trim()} · {profile.phone.trim()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Endereço</dt>
                  <dd>
                    {profile.address_line1.trim()}
                    {profile.address_line2.trim() ? `, ${profile.address_line2.trim()}` : ""} —{" "}
                    {profile.city.trim()}/{profile.state.trim().toUpperCase()} — CEP {profile.postal_code.trim() || "—"}
                  </dd>
                </div>
              </dl>

              {!usesMercadoPagoGateway(paymentMethod) && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Após confirmar, sua solicitação seguirá para validação manual; não haverá redirecionamento ao
                  Mercado Pago.
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setStep(2)}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={disableSubmit}
                  onClick={submitCheckout}
                >
                  {startMutation.isPending
                    ? "Enviando…"
                    : search.trial
                      ? "Iniciar teste"
                      : usesMercadoPagoGateway(paymentMethod)
                        ? "Ir para pagamento (Mercado Pago)"
                        : "Enviar solicitação"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Coluna direita: resumo fixo em desktop */}
        <aside className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-24 lg:self-start">
          <h3 className="font-display text-base">Resumo</h3>
          <div className="mt-3 text-sm">
            <div className="font-medium">{plan?.name ?? (plansQuery.isLoading ? "…" : "Plano")}</div>
            <div className="text-muted-foreground">
              {plan ? `R$ ${Number(plan.price ?? 0).toFixed(2).replace(".", ",")}/mês` : "—"}
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
            Etapa {step} de 3 · {STEPS[step - 1]?.title}
          </div>
          {!hasCompany && (
            <p className="mt-4 text-sm text-destructive">
              Associe-se a uma empresa para concluir a cobrança.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
