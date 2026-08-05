import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from "@/lib/public-booking-slug";
import {
  PUBLIC_BOOKING_STALE_MS,
  PUBLIC_SLOTS_STALE_MS,
  publicBookingKeys,
} from "@/lib/public-booking-queries";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { Calendar, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation } from "@tanstack/react-query";
import { buildAppointmentIcs, downloadAppointmentIcs } from "@/lib/calendar-ics";
import {
  clearRescheduleIntent,
  readRescheduleIntent,
  saveClientPortalSession,
} from "@/lib/client-portal-session";
import { publicBookingService, type PublicBookingProvider } from "@/services/publicBookingService";
import { packageService, type PackageLookupResult } from "@/services/packageService";
import {
  buildPublicBookingSteps,
  formatDurationLabel,
  formatMoneyBRL,
  getSelectedServices,
  getServiceCategories,
  getServicesTotalDurationMinutes,
  getServicesTotalPrice,
  isDateAllowedForPackage,
  toYmdLocal,
  toggleServiceSelection,
  type PublicBookingStep,
  type PublicServiceLike,
} from "@/lib/public-booking-flow";
import { clientPortalService } from "@/services/clientPortalService";
import { BrandedImage } from "@/components/booking/BrandedImage";
import { ProviderPickerCarousel } from "@/components/booking/ProviderPickerCarousel";
import { PublicStudioHero, getBrandingButtonStyle } from "@/components/booking/PublicStudioHero";
import { displayStudioName, normalizeHexColor, studioInitials } from "@/lib/branding-utils";
import { toast } from "sonner";
import { triggerWhatsAppBookingConfirmation } from "@/lib/trigger-whatsapp-send";

export const Route = createFileRoute("/agendar/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    reagendar:
      typeof search.reagendar === "string" && search.reagendar.length > 0 ? search.reagendar : undefined,
  }),
  component: Agendar,
});

type Step = PublicBookingStep;

function Agendar() {
  const { slug: slugParam } = Route.useParams();
  const { reagendar: reagendarAppointmentId } = Route.useSearch();
  const slug = useMemo(() => normalizePublicBookingSlug(slugParam), [slugParam]);
  const rescheduleIntent = useMemo(() => {
    const intent = readRescheduleIntent();
    if (!intent || intent.slug !== slug) return null;
    if (!reagendarAppointmentId || intent.appointmentId !== reagendarAppointmentId) return null;
    return intent;
  }, [slug, reagendarAppointmentId]);
  const isRescheduleMode = Boolean(rescheduleIntent);
  const [step, setStep] = useState<Step>("servico");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceCategory, setServiceCategory] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [clientPackageId, setClientPackageId] = useState<string | null>(null);
  const [packageLookup, setPackageLookup] = useState<PackageLookupResult | null>(null);
  const [packageWhatsapp, setPackageWhatsapp] = useState("");
  const [packageLookupError, setPackageLookupError] = useState<string | null>(null);
  const [packageFirstPurchase, setPackageFirstPurchase] = useState(false);
  const [bookingPendingPayment, setBookingPendingPayment] = useState(false);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", whatsapp: "", notes: "" });
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);

  useEffect(() => {
    if (!rescheduleIntent) return;
    setSelectedServiceIds([rescheduleIntent.serviceId]);
    setForm((f) => ({
      ...f,
      nome: rescheduleIntent.clientName ?? f.nome,
      whatsapp: rescheduleIntent.whatsapp || f.whatsapp,
    }));
    setStep("data");
  }, [rescheduleIntent]);

  const slugValid = isValidPublicBookingSlug(slug);

  const pageQuery = useQuery({
    queryKey: publicBookingKeys.page(slug),
    enabled: slugValid && isSupabaseConfigured(),
    staleTime: PUBLIC_BOOKING_STALE_MS,
    queryFn: async () => {
      if (!slug) return null;
      if (!isSupabaseConfigured()) {
        throw new Error("supabase_not_configured");
      }
      const res = await publicBookingService.getPageData(slug);
      if (res.error) throw res.error;
      const payload = res.data as {
        company?: { id: string; name: string; slug: string; phone?: string; email?: string } | null;
        branding?: Record<string, unknown> | null;
        whatsapp_notifications_available?: boolean;
        team_enabled?: boolean;
        packages_enabled?: boolean;
        services?: Array<{
          id: string;
          name: string;
          price?: number;
          duration_minutes?: number;
          image_url?: string | null;
          service_kind?: string;
          package_sessions?: number;
        }>;
      } | null;
      if (!payload?.company) return null;
      return payload;
    },
  });

  const company = pageQuery.data?.company ?? null;
  const branding = pageQuery.data?.branding ?? null;
  const whatsappNotificationsAvailable = Boolean(
    (pageQuery.data as { whatsapp_notifications_available?: boolean } | null)?.whatsapp_notifications_available,
  );
  const teamEnabled = Boolean((pageQuery.data as { team_enabled?: boolean } | null)?.team_enabled);
  const packagesEnabled = Boolean((pageQuery.data as { packages_enabled?: boolean } | null)?.packages_enabled);
  const servicos = pageQuery.data?.services ?? [];
  const selectedServices = getSelectedServices(selectedServiceIds, servicos as PublicServiceLike[]);
  const primaryServiceId = selectedServiceIds[0] ?? null;
  const servicoSel = selectedServices[0];
  const isPackageService =
    packagesEnabled &&
    selectedServices.length === 1 &&
    (servicoSel as { service_kind?: string } | undefined)?.service_kind === "package";
  const selectedDurationMinutes = getServicesTotalDurationMinutes(selectedServices);
  const selectedTotalPrice = getServicesTotalPrice(selectedServices);
  const serviceCategories = getServiceCategories(servicos as PublicServiceLike[]);
  const visibleServices = serviceCategory
    ? servicos.filter((service) => service.category === serviceCategory)
    : servicos;

  const providersQuery = useQuery({
    queryKey: publicBookingKeys.providers(slug, selectedServiceIds.join(",")),
    enabled: slugValid && selectedServiceIds.length > 0 && teamEnabled,
    staleTime: PUBLIC_BOOKING_STALE_MS,
    queryFn: async () => {
      const res = await publicBookingService.listProvidersMulti({ slug, serviceIds: selectedServiceIds });
      if (res.error) throw res.error;
      return (res.data ?? []) as PublicBookingProvider[];
    },
  });

  const providers = providersQuery.data ?? [];
  const needsProviderStep = teamEnabled && providers.length > 1;
  const steps = useMemo(
    () =>
      buildPublicBookingSteps({
        isReschedule: isRescheduleMode,
        needsProviderStep,
        isPackage: isPackageService,
        packageFirstPurchase,
      }),
    [isRescheduleMode, needsProviderStep, isPackageService, packageFirstPurchase],
  );

  useEffect(() => {
    if (!primaryServiceId || !teamEnabled) return;
    if (providers.length === 1) setProviderId(providers[0].id);
  }, [primaryServiceId, teamEnabled, providers]);

  useEffect(() => {
    setProviderId(null);
    setClientPackageId(null);
    setPackageLookup(null);
    setPackageWhatsapp("");
    setPackageLookupError(null);
    setPackageFirstPurchase(false);
    setBookingPendingPayment(false);
    setData(null);
    setHora(null);
  }, [selectedServiceIds]);

  useEffect(() => {
    if (!isPackageService || !packageWhatsapp.trim()) return;
    setForm((f) => ({ ...f, whatsapp: packageWhatsapp }));
  }, [packageWhatsapp, isPackageService]);

  const packageRules = useMemo(() => {
    if (!packageLookup?.found) {
      const svc = servicoSel as { package_allowed_dow?: number[] } | undefined;
      return {
        allowedDow: Array.isArray(svc?.package_allowed_dow) ? svc!.package_allowed_dow! : [],
        holidays: [] as string[],
      };
    }
    return {
      allowedDow: (packageLookup.allowed_dow ?? []) as number[],
      holidays: (packageLookup.holidays ?? []) as string[],
    };
  }, [packageLookup, servicoSel]);

  const slotsQuery = useQuery({
    queryKey: publicBookingKeys.slots(slug, selectedServiceIds.join(","), data ?? "", providerId),
    enabled:
      slugValid &&
      Boolean(selectedServiceIds.length && data) &&
      (!teamEnabled || !needsProviderStep || Boolean(providerId)),
    staleTime: PUBLIC_SLOTS_STALE_MS,
    queryFn: async () => {
      const res = await publicBookingService.getAvailableSlotsMulti({
        slug,
        serviceIds: selectedServiceIds,
        date: data!,
        providerId,
      });
      if (res.error) throw res.error;
      return (res.data ?? []) as string[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!primaryServiceId || !data || !hora) throw new Error("Dados incompletos");

      if (rescheduleIntent) {
        const res = await clientPortalService.rescheduleAppointment({
          slug,
          whatsapp: rescheduleIntent.whatsapp,
          appointmentId: rescheduleIntent.appointmentId,
          newDate: data,
          newTime: hora,
        });
        if (res.error) throw res.error;
        return { mode: "reschedule" as const, data: res.data as Record<string, unknown> };
      }

      const bookingParams = {
        slug,
        appointmentDate: data,
        appointmentTime: hora,
        clientName: form.nome,
        clientWhatsapp: isPackageService ? packageWhatsapp : form.whatsapp,
        notes: form.notes || null,
        whatsappNotifications:
          whatsappNotificationsAvailable &&
          whatsappOptIn &&
          Boolean((isPackageService ? packageWhatsapp : form.whatsapp).trim()),
        providerId,
        clientPackageId: isPackageService && clientPackageId ? clientPackageId : null,
      };
      const res =
        isPackageService || selectedServiceIds.length === 1
          ? await publicBookingService.createBooking({ ...bookingParams, serviceId: primaryServiceId })
          : await publicBookingService.createBookingMulti({ ...bookingParams, serviceIds: selectedServiceIds });
      if (res.error) throw res.error;
      return { mode: "create" as const, data: res.data };
    },
    onSuccess: async (result) => {
      const d = result.data as {
        ok?: boolean;
        error?: string;
        appointment_id?: string;
        pending_payment?: boolean;
        whatsapp_queued?: boolean;
        whatsapp_log_id?: string | null;
        whatsapp_send_token?: string | null;
      };
      if (!d?.ok) {
        if (d?.error === "horario_indisponivel") {
          toast.error("Esse horário acabou de ficar indisponível. Escolha outro horário.");
          setHora(null);
          return;
        }
        if (d?.error === "prazo_minimo") {
          toast.error("Esse horário não respeita o prazo mínimo de agendamento.");
          return;
        }
        if (d?.error === "pacote_invalido" || d?.error === "pacote_obrigatorio") {
          toast.error("Pacote inválido ou esgotado. Verifique com o studio.");
          return;
        }
        if (d?.error === "pacote_ja_existe") {
          toast.error("Já existe um pacote em andamento para este WhatsApp.");
          return;
        }
        if (d?.error === "limite_semanal_pacote") {
          toast.error("Limite de agendamentos do pacote nesta semana.");
          return;
        }
        if (d?.error === "dia_nao_permitido" || d?.error === "data_feriado") {
          toast.error("Data não permitida para este pacote.");
          return;
        }
        if (d?.error === "prestador_obrigatorio" || d?.error === "prestador_invalido") {
          toast.error("Selecione um profissional válido.");
          return;
        }
        toast.error(
          result.mode === "reschedule"
            ? "Não foi possível reagendar. Verifique os dados."
            : "Não foi possível criar o agendamento. Verifique os dados.",
        );
        return;
      }
      if (result.mode === "create" && !d.appointment_id) {
        toast.error("Não foi possível criar o agendamento. Verifique os dados.");
        return;
      }
      saveClientPortalSession({
        slug,
        nome: form.nome,
        whatsapp: isPackageService ? packageWhatsapp : form.whatsapp,
      });
      if (result.mode === "reschedule") clearRescheduleIntent();
      if (result.mode === "create" && d.appointment_id && d.whatsapp_queued) {
        await triggerWhatsAppBookingConfirmation({
          appointmentId: d.appointment_id,
          logId: d.whatsapp_log_id ?? undefined,
          sendToken: d.whatsapp_send_token ?? undefined,
        });
      }
      setBookingPendingPayment(Boolean(d.pending_payment));
      setStep("confirmado");
    },
    onError: () => {
      toast.error("Não foi possível criar o agendamento. Tente novamente.");
    },
  });

  const primary = normalizeHexColor(
    typeof branding?.primary_color === "string" ? branding.primary_color : null,
    "#1a1a1a",
  );
  const studioName = displayStudioName(company, branding as Parameters<typeof displayStudioName>[1]);
  const btnStyle = getBrandingButtonStyle(primary);

  const dateLabel = useMemo(() => {
    if (!data) return "";
    const dt = new Date(`${data}T00:00:00`);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  }, [data]);

  if (step === "confirmado") {
    const brandingRecord = branding as Record<string, unknown> | null;
    const location =
      (typeof brandingRecord?.public_address === "string" && brandingRecord.public_address) ||
      (typeof brandingRecord?.address === "string" && brandingRecord.address) ||
      undefined;
    return (
      <Confirmado
        slug={slug}
        studioName={studioName}
        servico={selectedServices.map((service) => service.name).join(", ")}
        data={data!}
        hora={hora!}
        primaryColor={primary}
        durationMinutes={selectedDurationMinutes}
        totalPrice={selectedTotalPrice}
        studioPhone={company?.phone ?? undefined}
        studioEmail={company?.email ?? undefined}
        location={location}
        clientWhatsapp={isPackageService ? packageWhatsapp : form.whatsapp}
        wasReschedule={isRescheduleMode}
        pendingPackagePayment={bookingPendingPayment}
      />
    );
  }

  if (!slugValid) {
    return (
      <PublicErrorCard
        title="Link inválido"
        message="O endereço desta página de agendamento não é válido. Verifique o link enviado pelo studio."
      />
    );
  }

  if (pageQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
        <p className="text-sm text-muted-foreground">Carregando página do studio…</p>
      </div>
    );
  }

  if (pageQuery.isError) {
    const configError =
      pageQuery.error instanceof Error && pageQuery.error.message === "supabase_not_configured";
    return (
      <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
          <h1 className="font-display text-xl">{configError ? "Serviço indisponível" : "Erro ao carregar informações"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {configError
              ? "A página de agendamento não está configurada neste ambiente. Tente novamente mais tarde."
              : "Erro ao carregar informações. Verifique sua conexão e tente de novo."}
          </p>
          <Link to="/" className="mt-6 inline-block text-sm text-foreground underline-offset-4 hover:underline">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
          <h1 className="font-display text-xl">Empresa não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este link de agendamento não existe ou o studio está indisponível no momento.
          </p>
          <Link to="/" className="mt-6 inline-block text-sm text-foreground underline-offset-4 hover:underline">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f4ef]">
      <PublicStudioHero
        company={company}
        branding={branding as Parameters<typeof PublicStudioHero>[0]["branding"]}
        slug={slug}
        onBookClick={() => document.getElementById("booking-services")?.scrollIntoView({ behavior: "smooth" })}
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 md:px-6">
        {isRescheduleMode ? (
          <div className="mt-6 rounded-2xl border border-gold/40 bg-gold-soft/30 px-4 py-3 text-center text-sm text-foreground md:mt-8">
            Reagendando seu atendimento — escolha uma nova data e horário disponíveis.
          </div>
        ) : null}
        <div className={`flex items-center justify-center gap-2 text-xs ${isRescheduleMode ? "mt-4" : "mt-6 md:mt-8"}`}>
          {steps.filter((s) => s !== "confirmado").map((s, i) => {
            const idx = steps.indexOf(step);
            const active = i <= idx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="grid size-8 place-items-center rounded-full text-[11px] font-medium text-background shadow-sm transition-all duration-200 md:size-9"
                  style={{
                    backgroundColor: active ? primary : undefined,
                    color: active ? "#fff" : undefined,
                    ...(active ? {} : { background: "var(--muted)", color: "var(--muted-foreground)" }),
                  }}
                >
                  {i + 1}
                </div>
                {i < steps.filter((x) => x !== "confirmado").length - 1 && (
                  <div
                    className="h-px w-6 md:w-10"
                    style={{ backgroundColor: active && i < idx ? primary : "var(--border)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div id="booking-services" className="mt-5 scroll-mt-4 animate-in fade-in slide-in-from-bottom-2 rounded-[28px] border border-border/50 bg-card p-6 shadow-[0_8px_40px_-14px_rgba(0,0,0,0.12)] duration-300 md:mt-6 md:p-8 lg:p-9">
          {step === "servico" && (
            <>
              <h2 className="font-display text-xl font-bold md:text-2xl">Escolha os serviços</h2>
              {servicos.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum serviço disponível.</p>
              ) : (
                <>
                  {serviceCategories.length > 0 ? (
                    <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-2">
                      <button
                        type="button"
                        onClick={() => setServiceCategory(null)}
                        className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${
                          serviceCategory === null ? "border-transparent text-white" : "border-border bg-background"
                        }`}
                        style={serviceCategory === null ? btnStyle : undefined}
                      >
                        Todos
                      </button>
                      {serviceCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setServiceCategory(category)}
                          className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${
                            serviceCategory === category ? "border-transparent text-white" : "border-border bg-background"
                          }`}
                          style={serviceCategory === category ? btnStyle : undefined}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="-mx-2 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-3">
                  {visibleServices.map((s) => {
                    const selected = selectedServiceIds.includes(s.id);
                    return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelectedServiceIds((current) =>
                          toggleServiceSelection(current, s as PublicServiceLike, servicos as PublicServiceLike[]),
                        )
                      }
                      className={`relative w-44 shrink-0 snap-start overflow-hidden rounded-2xl border bg-background text-left shadow-sm transition ${
                        selected ? "shadow-soft" : "border-border hover:border-foreground/30"
                      }`}
                      style={selected ? { borderColor: primary, borderWidth: 2 } : undefined}
                    >
                      {s.image_url ? (
                        <BrandedImage
                          src={s.image_url}
                          alt=""
                          className="h-56 w-44 object-cover"
                          fallback={
                            <ServiceInitials name={s.name} primary={primary} secondary={normalizeHexColor(typeof branding?.secondary_color === "string" ? branding.secondary_color : null, "#c9a960")} className="h-56 w-44 rounded-none" />
                          }
                        />
                      ) : (
                        <ServiceInitials name={s.name} primary={primary} secondary={normalizeHexColor(typeof branding?.secondary_color === "string" ? branding.secondary_color : null, "#c9a960")} className="h-56 w-44 rounded-none" />
                      )}
                      <div className="p-3">
                        <div className="font-medium">{s.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDurationLabel(Number(s.duration_minutes ?? 0))}
                          {(s as { service_kind?: string }).service_kind === "package"
                            ? ` · Pacote ${(s as { package_sessions?: number }).package_sessions ?? ""} sessões`
                            : ` · ${formatMoneyBRL(Number(s.price ?? 0))}`}
                        </div>
                      </div>
                      {selected ? (
                        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-white shadow-sm" style={btnStyle}>
                          <Check className="size-4" />
                        </span>
                      ) : null}
                    </button>
                    );
                  })}
                  </div>
                </>
              )}
            </>
          )}

          {step === "profissional" && (
            <>
              <h2 className="font-display text-xl font-bold md:text-2xl">Escolha o profissional</h2>
              {providersQuery.isLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">Carregando profissionais…</p>
              ) : providers.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum profissional disponível para este serviço.</p>
              ) : (
                <ProviderPickerCarousel
                  providers={providers}
                  selectedId={providerId}
                  onSelect={setProviderId}
                  primaryColor={primary}
                />
              )}
            </>
          )}

          {step === "whatsapp_pacote" && (
            <>
              <h2 className="font-display text-xl font-bold md:text-2xl">Identifique seu pacote</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {packageFirstPurchase
                  ? "Informe seu WhatsApp para vincular o novo pacote ao seu cadastro."
                  : "Já possui pacote? Informe o WhatsApp para agendar a próxima sessão. Novo pacote? Use o botão abaixo."}
              </p>
              <div className="mt-5 grid gap-4">
                <Field
                  label="WhatsApp"
                  value={packageWhatsapp}
                  onChange={(v) => {
                    setPackageWhatsapp(v);
                    setPackageLookupError(null);
                    setPackageLookup(null);
                    setClientPackageId(null);
                  }}
                  placeholder="(11) 99999-0000"
                />
                {packageLookup?.found ? (
                  <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">
                    <div className="font-medium text-foreground">
                      Pacote encontrado — sessão {packageLookup.session_label}
                    </div>
                    {packageLookup.provider_name ? (
                      <p className="mt-1 text-muted-foreground">Profissional: {packageLookup.provider_name}</p>
                    ) : null}
                    {packageLookup.is_last_session ? (
                      <p className="mt-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-3 py-2 text-foreground">
                        Atenção: este será o último serviço do seu pacote.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {packageFirstPurchase ? (
                  <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                    Novo pacote — após continuar você escolhe o profissional e a data. O pagamento é confirmado no
                    salão.
                  </p>
                ) : null}
                {packageLookupError ? (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {packageLookupError}
                  </p>
                ) : null}
                {!packageFirstPurchase && !packageLookup?.found ? (
                  <button
                    type="button"
                    disabled={!packageWhatsapp.trim()}
                    onClick={() => {
                      setPackageFirstPurchase(true);
                      setPackageLookup(null);
                      setClientPackageId(null);
                      setPackageLookupError(null);
                      const next = needsProviderStep ? "profissional" : "data";
                      setStep(next);
                    }}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition hover:bg-accent"
                  >
                    Contratar novo pacote
                  </button>
                ) : null}
              </div>
            </>
          )}

          {step === "data" && (
            <>
              <h2 className="font-display text-xl font-bold md:text-2xl">Escolha a data</h2>
              {packageLookup?.found && packageLookup.is_last_session ? (
                <p className="mt-2 rounded-xl border border-gold/40 bg-gold-soft/30 px-4 py-2 text-sm">
                  Último serviço do pacote ({packageLookup.session_label}).
                </p>
              ) : null}
              {packageLookup?.found ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Sessão {packageLookup.session_label} de {packageLookup.total_sessions}
                  {packageLookup.provider_name ? ` · ${packageLookup.provider_name}` : ""}
                </p>
              ) : packageFirstPurchase ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  1ª sessão do pacote — pagamento confirmado no salão após o atendimento.
                </p>
              ) : null}
              <div className="mt-5 flex justify-center">
                <div className="rounded-2xl border border-border bg-card p-2 shadow-soft">
                  <CalendarPicker
                    mode="single"
                    selected={data ? new Date(`${data}T12:00:00`) : undefined}
                    onSelect={(d) => {
                      if (!d) return;
                      setData(toYmdLocal(d));
                      setHora(null);
                    }}
                    locale={ptBR}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (date < today) return true;
                      if (isPackageService) {
                        return !isDateAllowedForPackage(date, packageRules);
                      }
                      return false;
                    }}
                    className="rounded-xl"
                  />
                </div>
              </div>
              {data && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-muted-foreground">Horários disponíveis</h3>
                  {slotsQuery.isLoading ? (
                    <p className="mt-3 text-sm text-muted-foreground">Carregando horários…</p>
                  ) : (
                    <>
                      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto pb-2 md:mx-0 md:flex-wrap md:overflow-visible">
                        {(slotsQuery.data ?? []).map((h) => {
                          const sel = hora === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setHora(h)}
                              className={`min-h-12 min-w-[5.5rem] shrink-0 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                                sel
                                  ? "border-transparent text-background"
                                  : "border-border bg-success/10 hover:border-foreground/40"
                              }`}
                              style={sel ? btnStyle : undefined}
                            >
                              {h}
                            </button>
                          );
                        })}
                      </div>
                      {!slotsQuery.isLoading && (slotsQuery.data ?? []).length === 0 && (
                        <p className="mt-3 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                          Nenhum horário disponível para esta data.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {step === "dados" && (
            <>
              <h2 className="font-display text-xl font-bold md:text-2xl">Seus dados</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isPackageService ? "Confirme seu nome para finalizar." : "Para confirmarmos seu agendamento."}
              </p>
              <div className="mt-5 grid gap-4">
                <Field label="Nome completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                {!isPackageService ? (
                  <Field
                    label="WhatsApp"
                    value={form.whatsapp}
                    onChange={(v) => setForm({ ...form, whatsapp: v })}
                    placeholder="(11) 99999-0000"
                  />
                ) : null}
                <Field label="Observações (opcional)" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
                {whatsappNotificationsAvailable && !isPackageService && form.whatsapp.trim() && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={whatsappOptIn}
                      onChange={(e) => setWhatsappOptIn(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-foreground">Receber confirmação no WhatsApp</span>
                      <span className="mt-1 block text-muted-foreground">
                        Enviaremos uma mensagem com data, horário e serviço (conforme políticas da Meta).
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <div className="mt-6 rounded-2xl bg-secondary/60 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviços</span>
                  <span className="max-w-[65%] text-right">{selectedServices.map((service) => service.name).join(", ")}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Data</span>
                  <span>{dateLabel}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Horário</span>
                  <span>{hora}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
                  <span>{isPackageService ? "Pacote" : "Total"}</span>
                  <span>
                    {isPackageService
                      ? packageLookup?.session_label ??
                        (packageFirstPurchase
                          ? `1/${(servicoSel as { package_sessions?: number })?.package_sessions ?? "?"}` 
                          : "Sessão")
                      : formatMoneyBRL(selectedTotalPrice)}
                  </span>
                </div>
              </div>
            </>
          )}

          {step !== "servico" ? (
          <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                const i = steps.indexOf(step);
                if (i > 0) setStep(steps[i - 1]);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Voltar
            </button>
            <button
              type="button"
              disabled={
                (step === "profissional" && !providerId) ||
                (step === "whatsapp_pacote" && !packageWhatsapp.trim()) ||
                (step === "data" && (!data || !hora)) ||
                (step === "dados" &&
                  (!form.nome.trim() || (!isPackageService && !form.whatsapp.trim())))
              }
              onClick={async () => {
                if (step === "whatsapp_pacote" && primaryServiceId && !packageFirstPurchase) {
                  setPackageLookupError(null);
                  const res = await packageService.lookupPackage({
                    slug,
                    whatsapp: packageWhatsapp,
                    serviceId: primaryServiceId,
                  });
                  if (res.error) {
                    toast.error("Erro ao buscar pacote.");
                    return;
                  }
                  const payload = res.data as PackageLookupResult;
                  if (payload?.error === "aguardando_pagamento_salao" || payload?.pending_payment) {
                    setPackageLookup(null);
                    setClientPackageId(null);
                    setPackageLookupError(
                      "Pacote aguardando confirmação de pagamento no salão. Peça ao caixa/admin para confirmar em Admin → Clientes ou Agenda.",
                    );
                    return;
                  }
                  if (!payload?.found) {
                    setPackageLookup(null);
                    setClientPackageId(null);
                    setPackageLookupError(
                      "Pacote não encontrado. Se é sua primeira vez, use «Contratar novo pacote».",
                    );
                    return;
                  }
                  setPackageLookup(payload);
                  setClientPackageId(payload.client_package_id ?? null);
                  if (payload.provider_id) setProviderId(payload.provider_id);
                  if (payload.client_name) {
                    setForm((f) => ({ ...f, nome: payload.client_name ?? f.nome }));
                  }
                  const i = steps.indexOf(step);
                  if (i < steps.length - 1) setStep(steps[i + 1]);
                  return;
                }
                if (step === "data" && data && hora) {
                  setStep("dados");
                  return;
                }
                const i = steps.indexOf(step);
                if (i < steps.length - 1) setStep(steps[i + 1]);
                else createMutation.mutate();
              }}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium shadow-[0_4px_20px_-6px_rgba(0,0,0,0.25)] transition hover:opacity-90 disabled:opacity-30 sm:w-auto"
              style={btnStyle}
            >
              {step === "dados"
                ? createMutation.isPending
                  ? "Confirmando…"
                  : isRescheduleMode
                    ? "Confirmar reagendamento"
                    : "Confirmar agendamento"
                : step === "whatsapp_pacote"
                  ? packageFirstPurchase
                    ? "Continuar"
                    : "Buscar pacote"
                  : "Continuar"}
              <ArrowRight className="size-4" />
            </button>
          </div>
          ) : null}
        </div>

        {step === "servico" ? (
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/70 bg-[#f7f4ef]/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4">
              <div className="min-w-0 text-sm">
                <div className="font-medium">{selectedServiceIds.length} selecionado{selectedServiceIds.length === 1 ? "" : "s"}</div>
                <div className="text-muted-foreground">
                  {formatDurationLabel(selectedDurationMinutes)} · {formatMoneyBRL(selectedTotalPrice)}
                </div>
              </div>
              <button
                type="button"
                disabled={selectedServiceIds.length === 0}
                onClick={() => {
                  const i = steps.indexOf(step);
                  if (i < steps.length - 1) setStep(steps[i + 1]);
                }}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium shadow-[0_4px_20px_-6px_rgba(0,0,0,0.25)] transition hover:opacity-90 disabled:opacity-30"
                style={btnStyle}
              >
                Continuar <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-8 text-center">
          <Link
            to="/cliente"
            search={{ slug, auto: "1" }}
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            Já é cliente? Ver meus atendimentos →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
      />
    </label>
  );
}

function Confirmado({
  slug,
  studioName,
  servico,
  data,
  hora,
  primaryColor,
  durationMinutes,
  totalPrice,
  studioPhone,
  studioEmail,
  location,
  clientWhatsapp,
  wasReschedule,
  pendingPackagePayment,
}: {
  slug: string;
  studioName: string;
  servico: string;
  data: string;
  hora: string;
  primaryColor: string;
  durationMinutes?: number;
  totalPrice: number;
  studioPhone?: string;
  studioEmail?: string;
  location?: string;
  clientWhatsapp?: string;
  wasReschedule?: boolean;
  pendingPackagePayment?: boolean;
}) {
  const btnStyle = getBrandingButtonStyle(primaryColor);
  const publicPageHref = `/agendar/${encodeURIComponent(slug)}`;

  const onAddToCalendar = () => {
    const descriptionLines = [
      `Estúdio: ${studioName}`,
      studioPhone ? `WhatsApp/telefone: ${studioPhone}` : null,
      studioEmail ? `E-mail: ${studioEmail}` : null,
      `Serviço: ${servico}`,
      `Duração: ${formatDurationLabel(durationMinutes ?? 0)}`,
      `Total: ${formatMoneyBRL(totalPrice)}`,
    ].filter((line): line is string => Boolean(line));

    const ics = buildAppointmentIcs({
      title: `${servico} — ${studioName}`,
      studioName,
      dateYmd: data,
      timeHm: hora.slice(0, 5),
      durationMinutes,
      location,
      descriptionLines,
    });
    downloadAppointmentIcs(`agendamento-${slug}-${data}`, ics);
    toast.success("Arquivo de calendário gerado.");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/15">
          <Check className="size-8 text-success" />
        </div>
        <h1 className="mt-5 font-display text-2xl">
          {wasReschedule ? "Reagendamento confirmado!" : "Agendamento confirmado!"}
        </h1>
        {pendingPackagePayment ? (
          <p className="mt-2 rounded-xl border border-gold/40 bg-gold-soft/30 px-4 py-3 text-sm text-foreground">
            Seu horário está reservado. O pagamento do pacote será confirmado no salão — se preferir pagar só esta
            sessão, avise na recepção.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Você receberá uma mensagem no WhatsApp.</p>
        )}

        <div className="mt-6 space-y-2 rounded-2xl bg-secondary/60 p-5 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estúdio</span>
            <span>{studioName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Serviço</span>
            <span className="max-w-[65%] text-right">{servico}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duração</span>
            <span>{formatDurationLabel(durationMinutes ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span>{formatMoneyBRL(totalPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data</span>
            <span>{new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Horário</span>
            <span>{hora}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddToCalendar}
          className="mt-6 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm"
          style={btnStyle}
        >
          <Calendar className="size-4" /> Adicionar ao calendário
        </button>
        <Link
          to="/cliente"
          search={{
            slug,
            auto: "1",
            ...(clientWhatsapp ? { whatsapp: clientWhatsapp } : {}),
          }}
          className="mt-3 inline-block w-full rounded-full border border-border bg-background px-5 py-3 text-sm"
        >
          Ver meus atendimentos
        </Link>
        <a
          href={publicPageHref}
          className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Voltar à página
        </a>
      </div>
    </div>
  );
}

function PublicErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <h1 className="font-display text-xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link to="/" className="mt-6 inline-block text-sm text-foreground underline-offset-4 hover:underline">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

function ServiceInitials({
  name,
  primary,
  secondary,
  className = "size-16 rounded-xl",
}: {
  name: string;
  primary: string;
  secondary: string;
  className?: string;
}) {
  return (
    <div
      className={`grid shrink-0 place-items-center text-lg font-semibold text-background ${className}`}
      style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
    >
      {studioInitials(name)}
    </div>
  );
}
