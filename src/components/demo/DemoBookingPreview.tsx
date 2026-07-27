import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Instagram,
  Lock,
  MapPin,
  MessageCircle,
  Star,
  Zap,
} from "lucide-react";
import { ProviderPickerCarousel } from "@/components/booking/ProviderPickerCarousel";
import {
  DEMO_BEAUTY_SHOWCASE,
  formatDemoPrice,
  getDemoBookingSteps,
  prefetchDemoAssets,
  type DemoBookingStep,
  type DemoProvider,
  type DemoShowcase,
} from "@/lib/demo-showcase-data";
import {
  DEMO_TIME_SLOTS,
  buildMonthCalendarCells,
  canNavigateDemoMonth,
  getDemoSlotUnavailabilityReason,
  getMonthLabel,
  getSelectedServices,
  getTotalDurationMinutes,
  getTotalPrice,
  isDemoSlotSelectable,
} from "@/lib/demo-booking-utils";
import { toast } from "sonner";

const BADGE_ICONS = [Zap, Lock, Star] as const;

type Variant = "desktop" | "mobile";

/** Demonstração interativa — mesmo visual da referência, fluxo local (sem Supabase). */
export function DemoBookingPreview({
  variant,
  demo = DEMO_BEAUTY_SHOWCASE,
}: {
  variant: Variant;
  demo?: DemoShowcase;
}) {
  const mobile = variant === "mobile";
  const dark = demo.theme === "dark";
  const bookingSteps = useMemo(() => getDemoBookingSteps(demo), [demo]);
  const providers = demo.providers ?? [];
  const [step, setStep] = useState<DemoBookingStep>("servico");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "" });

  useEffect(() => {
    prefetchDemoAssets(demo);
  }, [demo]);

  const selectedServices = useMemo(
    () => getSelectedServices(serviceIds, demo.services),
    [serviceIds, demo.services],
  );
  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );
  const carouselProviders = useMemo(
    () =>
      providers.map((p, index) => ({
        id: p.id,
        display_name: p.name,
        photo_url: p.imageUrl,
        color: demo.accent,
        is_owner: index === 0,
        subtitle: p.role,
      })),
    [providers, demo.accent],
  );
  const totalDurationMinutes = useMemo(
    () => getTotalDurationMinutes(serviceIds, demo.services),
    [serviceIds, demo.services],
  );
  const totalPrice = useMemo(
    () => getTotalPrice(serviceIds, demo.services),
    [serviceIds, demo.services],
  );
  const stepIndex = bookingSteps.indexOf(step === "confirmado" ? "dados" : step);

  const dateLabel = useMemo(() => {
    if (!date) return "";
    return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [date]);

  const toggleService = (id: string) => {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setTime(null);
  };

  const resetDemo = () => {
    setStep("servico");
    setServiceIds([]);
    setProviderId(null);
    setDate(null);
    setTime(null);
    setForm({ nome: "", email: "", whatsapp: "" });
  };

  const goBack = () => {
    const i = bookingSteps.indexOf(step as (typeof bookingSteps)[number]);
    if (i > 0) setStep(bookingSteps[i - 1]!);
  };

  const canContinue =
    (step === "servico" && serviceIds.length > 0) ||
    (step === "profissional" && Boolean(providerId)) ||
    (step === "data" && Boolean(date)) ||
    (step === "horario" && Boolean(time)) ||
    (step === "dados" && Boolean(form.nome.trim() && (form.email.trim() || form.whatsapp.trim())));

  const handleTimeSelect = (slot: string) => {
    const reason = getDemoSlotUnavailabilityReason(slot, totalDurationMinutes, serviceIds.length);
    if (reason) {
      toast.error(reason);
      return;
    }
    setTime(slot);
  };

  const handleContinue = () => {
    if (!canContinue) return;
    const i = bookingSteps.indexOf(step as (typeof bookingSteps)[number]);
    if (i < bookingSteps.length - 1) {
      setStep(bookingSteps[i + 1]!);
      return;
    }
    setStep("confirmado");
    toast.success("Demonstração: agendamento simulado com sucesso!");
  };

  return (
    <div
      className={
        mobile
          ? `demo-preview demo-preview--mobile ${dark ? "demo-preview--dark bg-[#111111] text-[#f3f3f3]" : "bg-[#fdf9f4]"}`
          : `demo-preview demo-preview--desktop overflow-hidden rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] ${
              dark ? "demo-preview--dark bg-[#111111] text-[#f3f3f3]" : "bg-[#fdf9f4]"
            }`
      }
      style={{ ["--demo-accent" as string]: demo.accent }}
    >
      {step !== "confirmado" ? (
        <>
          <DemoHero mobile={mobile} demo={demo} />
          <DemoStudioCard mobile={mobile} demo={demo} />
          <DemoStepper
            activeIndex={stepIndex}
            stepsCount={bookingSteps.length}
            mobile={mobile}
            accent={demo.accent}
            dark={dark}
          />
        </>
      ) : null}

      <div className={mobile ? "px-3 pb-4" : "px-4 pb-4 md:px-5"}>
        {step === "confirmado" ? (
          <DemoConfirmed
            mobile={mobile}
            demo={demo}
            services={selectedServices}
            provider={selectedProvider}
            totalPrice={totalPrice}
            totalDurationMinutes={totalDurationMinutes}
            date={date!}
            time={time!}
            onRestart={resetDemo}
          />
        ) : (
          <>
            <StepHeading step={step} mobile={mobile} dark={dark} />
            {step === "servico" && (
              <>
                <p className={`mb-3 ${dark ? "text-[#aaa]" : "text-[#888]"} ${mobile ? "text-xs" : "text-sm"}`}>
                  Selecione um ou mais serviços. A duração total será somada no agendamento.
                </p>
                <ServiceGrid
                  mobile={mobile}
                  demo={demo}
                  selectedIds={serviceIds}
                  onToggle={toggleService}
                />
              </>
            )}
            {step === "profissional" && (
              <>
                <p className={`mb-3 ${dark ? "text-[#aaa]" : "text-[#888]"} ${mobile ? "text-xs" : "text-sm"}`}>
                  Escolha o barbeiro que vai te atender.
                </p>
                <ProviderPickerCarousel
                  providers={carouselProviders}
                  selectedId={providerId}
                  onSelect={setProviderId}
                  primaryColor={demo.accent}
                  tone={dark ? "dark" : "default"}
                  className="mt-2"
                  hint="Deslize para escolher o profissional"
                />
              </>
            )}
            {step === "data" && (
              <DateGrid
                selected={date}
                onSelect={(ymd) => {
                  setDate(ymd);
                  setTime(null);
                }}
                mobile={mobile}
                dark={dark}
                accent={demo.accent}
              />
            )}
            {step === "horario" && (
              <TimeGrid
                selected={time}
                onSelect={handleTimeSelect}
                mobile={mobile}
                totalDurationMinutes={totalDurationMinutes}
                serviceCount={serviceIds.length}
                dark={dark}
                accent={demo.accent}
              />
            )}
            {step === "dados" && (
              <ClientForm
                mobile={mobile}
                form={form}
                onChange={setForm}
                services={selectedServices}
                totalPrice={totalPrice}
                totalDurationMinutes={totalDurationMinutes}
                dateLabel={dateLabel}
                time={time}
                dark={dark}
                accent={demo.accent}
              />
            )}
            <DemoActions
              mobile={mobile}
              step={step}
              canContinue={canContinue}
              submitting={false}
              onBack={goBack}
              onContinue={handleContinue}
              dark={dark}
              accent={demo.accent}
            />
          </>
        )}
      </div>

      {!mobile && step !== "confirmado" ? <DemoFooterImage demo={demo} /> : null}
    </div>
  );
}

function DemoHero({ mobile, demo }: { mobile: boolean; demo: DemoShowcase }) {
  return (
    <div
      className={`relative overflow-hidden bg-black ${
        mobile ? "min-h-[188px]" : "min-h-[220px] rounded-t-[20px]"
      }`}
    >
      <img
        src={demo.assets.banner}
        alt=""
        className="absolute inset-0 size-full object-cover object-center"
        fetchPriority="high"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-transparent" />
      <div
        className={`relative flex ${
          mobile
            ? "min-h-[188px] flex-col justify-end gap-2 p-4 pb-2"
            : "min-h-[220px] grid-cols-1 items-end gap-2 p-6 pb-3 md:grid-cols-[1fr_38%] md:p-8"
        }`}
      >
        <div className={mobile ? "z-10 max-w-full" : "z-10 max-w-md pb-4"}>
          <h1
            className={`font-display font-bold leading-[1.12] text-white ${
              mobile ? "text-[1.2rem]" : "text-[2rem] lg:text-[2.1rem]"
            }`}
          >
            <span className="block">{demo.hero.titleLine1}</span>
            <span className="mt-0.5 block" style={{ color: demo.accent }}>
              {demo.hero.titleLine2}
            </span>
          </h1>
          <p
            className={`mt-2 whitespace-pre-line leading-snug text-white/85 ${
              mobile ? "text-[10px]" : "text-sm"
            }`}
          >
            {demo.hero.subtitle}
          </p>
          <ul className={`mt-3 flex ${mobile ? "gap-4" : "mt-4 gap-8"}`}>
            {demo.hero.badges.map((label, i) => {
              const Icon = BADGE_ICONS[i] ?? Star;
              return (
                <li key={label} className="flex flex-col items-center gap-1 text-center">
                  <Icon className="size-5" style={{ color: demo.accent }} strokeWidth={1.75} />
                  <span className={`font-medium text-white/90 ${mobile ? "text-[9px]" : "text-xs"}`}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DemoStudioCard({ mobile, demo }: { mobile: boolean; demo: DemoShowcase }) {
  const s = demo.studio;
  const dark = demo.theme === "dark";
  return (
    <div
      className={`relative z-10 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${
        dark ? "bg-[#1a1a1a] text-[#f3f3f3]" : "bg-white"
      } ${mobile ? "-mt-4 mx-3 rounded-2xl p-4" : "-mt-8 mx-4 rounded-2xl p-5 md:mx-5 md:p-6"}`}
    >
      {mobile ? (
        <>
          <div className="flex gap-3">
            <img
              src={demo.assets.logo}
              alt=""
              className="size-[72px] shrink-0 rounded-xl object-cover object-center ring-1 ring-black/10"
              width={72}
              height={72}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <div className="min-w-0 pt-1">
              <h2 className={`font-display text-base font-bold ${dark ? "text-white" : "text-[#1a1a1a]"}`}>
                {s.name}
              </h2>
              <p className={`mt-0.5 text-[11px] ${dark ? "text-[#aaa]" : "text-[#888]"}`}>{s.slogan}</p>
            </div>
          </div>
          <div className="mt-3">
            <StudioDetails centered demo={demo} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-6 md:grid-cols-[160px_minmax(0,1fr)] md:gap-8">
          <img
            src={demo.assets.logo}
            alt=""
            className="size-[140px] rounded-2xl object-cover object-center ring-1 ring-black/10 md:size-[160px]"
            width={160}
            height={160}
            loading="eager"
            decoding="async"
          />
          <div>
            <h2
              className={`font-display text-xl font-bold md:text-2xl ${dark ? "text-white" : "text-[#1a1a1a]"}`}
            >
              {s.name}
            </h2>
            <p className={`mt-1 text-sm ${dark ? "text-[#aaa]" : "text-[#888]"}`}>{s.slogan}</p>
            <div className="mt-4">
              <StudioDetails demo={demo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudioDetails({ centered, demo }: { centered?: boolean; demo: DemoShowcase }) {
  const s = demo.studio;
  const dark = demo.theme === "dark";
  return (
    <div className={`flex flex-col gap-3 ${centered ? "items-center text-center" : ""}`}>
      <div className={`flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
        <a
          href={s.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="demo-pill-instagram inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[#333]"
        >
          <Instagram className="size-3.5 text-[#c13584]" />
          {s.instagram}
        </a>
        <a
          href={s.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="demo-pill-whatsapp inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
        >
          <MessageCircle className="size-3.5 text-[#25d366]" />
          {s.whatsapp}
        </a>
      </div>
      <p
        className={`text-xs leading-relaxed ${dark ? "text-[#bbb]" : "text-[#555]"} ${
          centered ? "max-w-[260px]" : "max-w-lg"
        }`}
      >
        {s.description}
      </p>
      <div
        className={`flex flex-col gap-1.5 text-xs ${dark ? "text-[#999]" : "text-[#777]"} ${
          centered ? "items-center" : ""
        }`}
      >
        <span className="inline-flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: demo.accent }} />
          {s.address}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" style={{ color: demo.accent }} />
          {s.hours}
        </span>
      </div>
    </div>
  );
}

function DemoStepper({
  activeIndex,
  stepsCount,
  mobile,
  accent,
  dark,
}: {
  activeIndex: number;
  stepsCount: number;
  mobile: boolean;
  accent: string;
  dark: boolean;
}) {
  const indices = Array.from({ length: stepsCount }, (_, i) => i);
  return (
    <div className={`flex justify-center ${dark ? "bg-[#111111]" : "bg-[#fdf9f4]"} ${mobile ? "py-4" : "py-5"}`}>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {indices.map((i) => (
          <div key={i} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`grid place-items-center rounded-full font-semibold ${
                mobile ? "size-7 text-[11px]" : "size-8 text-xs"
              } ${
                i <= activeIndex
                  ? dark
                    ? "text-black"
                    : "bg-black text-white"
                  : dark
                    ? "bg-[#2a2a2a] text-[#777]"
                    : "bg-[#e8e4dc] text-[#999]"
              }`}
              style={i <= activeIndex && dark ? { backgroundColor: accent } : undefined}
            >
              {i + 1}
            </span>
            {i < stepsCount - 1 ? (
              <span
                className={`h-px ${mobile ? "w-3.5" : "w-8"} ${
                  i < activeIndex
                    ? dark
                      ? "bg-white/30"
                      : "bg-black/30"
                    : dark
                      ? "bg-[#333]"
                      : "bg-[#ddd8ce]"
                }`}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepHeading({
  step,
  mobile,
  dark,
}: {
  step: DemoBookingStep;
  mobile: boolean;
  dark: boolean;
}) {
  const titles: Record<Exclude<DemoBookingStep, "confirmado">, string> = {
    servico: "Escolha o serviço",
    profissional: "Escolha o barbeiro",
    data: "Escolha a data",
    horario: "Escolha o horário de início",
    dados: "Seus dados",
  };
  if (step === "confirmado") return null;
  return (
    <h2
      className={`font-display font-bold ${dark ? "text-white" : "text-[#1a1a1a]"} ${
        mobile ? "mb-3 text-base" : "mb-4 text-xl"
      }`}
    >
      {titles[step]}
    </h2>
  );
}

function ServiceThumb({
  src,
  name,
  mobile,
}: {
  src: string;
  name: string;
  mobile: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const size = mobile
    ? "h-[4.5rem] w-[4.5rem] min-w-[4.5rem]"
    : "h-[5.75rem] w-[5.75rem] min-w-[5.75rem]";

  if (failed) {
    return (
      <div
        className={`${size} grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#c9a960] text-sm font-bold text-white`}
        aria-hidden
      >
        {name.trim().charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="eager"
      decoding="async"
      fetchPriority="high"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-xl object-cover object-center shadow-[0_1px_6px_rgba(0,0,0,0.08)]`}
    />
  );
}

function ServiceGrid({
  mobile,
  demo,
  selectedIds,
  onToggle,
}: {
  mobile: boolean;
  demo: DemoShowcase;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const dark = demo.theme === "dark";
  return (
    <div className={`grid gap-3 ${mobile ? "grid-cols-1" : "grid-cols-2 gap-4"}`}>
      {demo.services.map((s) => {
        const selected = selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`group flex items-center rounded-xl border text-left transition ${
              mobile ? "min-h-[5.25rem] gap-3.5 p-3" : "min-h-[6.5rem] gap-4 p-3.5 md:p-4"
            } ${
              dark
                ? selected
                  ? "border-[#c9a227] bg-[#1c1c1c] shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
                  : "border-[#2a2a2a] bg-[#171717] hover:border-[#c9a227]/50"
                : selected
                  ? "border-[#1a1a1a] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                  : "border-[#ebe6dc] bg-white hover:border-[#d4af37]/50 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            }`}
          >
            <ServiceThumb name={s.name} src={s.imageUrl} mobile={mobile} />
            <div className="min-w-0 flex-1">
              <div
                className={`font-semibold leading-snug ${dark ? "text-white" : "text-[#1a1a1a]"} ${
                  mobile ? "text-sm" : "text-[15px]"
                }`}
              >
                {s.name}
              </div>
              <div className={`${dark ? "text-[#aaa]" : "text-[#888]"} ${mobile ? "text-xs" : "text-sm"}`}>
                {s.duration_minutes} min · R$ {formatDemoPrice(s.price)}
              </div>
            </div>
            {selected ? (
              <Check className={`size-4 shrink-0 ${dark ? "text-[#c9a227]" : "text-[#1a1a1a]"}`} />
            ) : (
              <ChevronRight className={`shrink-0 ${dark ? "text-[#555]" : "text-[#ccc]"} ${mobile ? "size-4" : "size-5"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function DateGrid({
  selected,
  onSelect,
  mobile,
  dark,
  accent,
}: {
  selected: string | null;
  onSelect: (ymd: string) => void;
  mobile: boolean;
  dark: boolean;
  accent: string;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const cells = useMemo(() => buildMonthCalendarCells(year, month), [year, month]);
  const monthLabel = getMonthLabel(year, month);
  const canPrev = canNavigateDemoMonth(year, month, -1);
  const canNext = canNavigateDemoMonth(year, month, 1);

  const shiftMonth = (delta: -1 | 1) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <div>
      <div className={`mb-3 flex items-center justify-between ${mobile ? "text-sm" : ""}`}>
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => shiftMonth(-1)}
          className={`grid size-8 place-items-center rounded-full transition disabled:opacity-30 ${
            dark ? "text-[#aaa] hover:bg-[#222]" : "text-[#666] hover:bg-white"
          }`}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span
          className={`font-display text-base font-semibold capitalize md:text-lg ${
            dark ? "text-white" : "text-[#1a1a1a]"
          }`}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => shiftMonth(1)}
          className={`grid size-8 place-items-center rounded-full transition disabled:opacity-30 ${
            dark ? "text-[#aaa] hover:bg-[#222]" : "text-[#666] hover:bg-white"
          }`}
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className={`grid grid-cols-7 gap-1.5 ${mobile ? "text-[9px]" : "text-xs"}`}>
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className={`text-center font-medium ${dark ? "text-[#777]" : "text-[#999]"}`}>
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (cell.type === "empty") {
            return <div key={`e-${i}`} className="aspect-square" aria-hidden />;
          }
          const sel = selected === cell.ymd;
          return (
            <button
              key={cell.ymd}
              type="button"
              disabled={cell.isPast}
              onClick={() => onSelect(cell.ymd)}
              className={`aspect-square rounded-lg text-sm transition ${
                cell.isPast
                  ? dark
                    ? "cursor-not-allowed text-[#444]"
                    : "cursor-not-allowed text-[#ccc]"
                  : sel
                    ? dark
                      ? "font-medium text-black"
                      : "bg-black font-medium text-white"
                    : cell.isToday
                      ? dark
                        ? "bg-[#1c1c1c] font-semibold text-white ring-2"
                        : "bg-white font-semibold text-[#1a1a1a] ring-2 ring-[#d4af37]/70 hover:ring-[#d4af37]"
                      : dark
                        ? "bg-[#1c1c1c] text-[#ddd] ring-1 ring-[#333] hover:ring-[#c9a227]/60"
                        : "bg-white text-[#333] ring-1 ring-[#ebe6dc] hover:ring-[#d4af37]/60"
              } ${mobile ? "text-xs" : ""}`}
              style={
                sel && dark
                  ? { backgroundColor: accent }
                  : cell.isToday && !sel && dark
                    ? { boxShadow: `0 0 0 2px ${accent}` }
                    : undefined
              }
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  selected,
  onSelect,
  mobile,
  totalDurationMinutes,
  serviceCount,
  dark,
  accent,
}: {
  selected: string | null;
  onSelect: (t: string) => void;
  mobile: boolean;
  totalDurationMinutes: number;
  serviceCount: number;
  dark: boolean;
  accent: string;
}) {
  const durationLabel =
    totalDurationMinutes >= 60
      ? `${Math.floor(totalDurationMinutes / 60)}h${totalDurationMinutes % 60 ? ` ${totalDurationMinutes % 60}min` : ""}`
      : `${totalDurationMinutes} min`;

  return (
    <div>
      <p className={`mb-3 ${dark ? "text-[#aaa]" : "text-[#888]"} ${mobile ? "text-xs" : "text-sm"}`}>
        {serviceCount} serviço(s) · duração total {durationLabel}. Escolha o horário de início.
      </p>
      <div className={`grid gap-2 ${mobile ? "grid-cols-3" : "grid-cols-4 md:grid-cols-5"}`}>
        {DEMO_TIME_SLOTS.map((h) => {
          const sel = selected === h;
          const available = isDemoSlotSelectable(h, totalDurationMinutes);
          return (
            <button
              key={h}
              type="button"
              onClick={() => onSelect(h)}
              className={`min-h-10 rounded-xl border text-sm transition ${
                sel
                  ? dark
                    ? "border-transparent text-black"
                    : "border-black bg-black text-white"
                  : available
                    ? dark
                      ? "border-[#333] bg-[#1c1c1c] text-[#ddd] hover:border-[#c9a227]/60"
                      : "border-[#ebe6dc] bg-white text-[#333] hover:border-[#d4af37]/60"
                    : dark
                      ? "cursor-not-allowed border-[#2a2a2a] bg-[#151515] text-[#555] line-through"
                      : "cursor-not-allowed border-[#ebe6dc] bg-[#f5f3ef] text-[#bbb] line-through decoration-[#ccc]"
              } ${mobile ? "text-xs" : ""}`}
              style={sel && dark ? { backgroundColor: accent } : undefined}
            >
              {h}
            </button>
          );
        })}
      </div>
      <p className={`mt-3 ${dark ? "text-[#777]" : "text-[#999]"} ${mobile ? "text-[10px]" : "text-xs"}`}>
        Demonstração: horários riscados não comportam a duração total (ex.: ocupado às 10h).
      </p>
    </div>
  );
}

function ClientForm({
  mobile,
  form,
  onChange,
  services,
  totalPrice,
  totalDurationMinutes,
  dateLabel,
  time,
  dark,
}: {
  mobile: boolean;
  form: { nome: string; email: string; whatsapp: string };
  onChange: (f: { nome: string; email: string; whatsapp: string }) => void;
  services: ReturnType<typeof getSelectedServices>;
  totalPrice: number;
  totalDurationMinutes: number;
  dateLabel: string;
  time: string | null;
  dark: boolean;
  accent: string;
}) {
  return (
    <div className="space-y-4">
      <p className={`${dark ? "text-[#aaa]" : "text-[#888]"} ${mobile ? "text-[11px]" : "text-sm"}`}>
        Preencha para confirmarmos seu agendamento (demonstração — nada é enviado ao servidor).
      </p>
      <DemoField
        label="Nome completo"
        value={form.nome}
        onChange={(nome) => onChange({ ...form, nome })}
        mobile={mobile}
        dark={dark}
      />
      <DemoField
        label="E-mail"
        type="email"
        value={form.email}
        onChange={(email) => onChange({ ...form, email })}
        mobile={mobile}
        dark={dark}
      />
      <DemoField
        label="WhatsApp"
        value={form.whatsapp}
        onChange={(whatsapp) => onChange({ ...form, whatsapp })}
        placeholder="(11) 99999-0000"
        mobile={mobile}
        dark={dark}
      />
      <div
        className={`rounded-xl p-4 ring-1 ${
          dark ? "bg-[#1c1c1c] ring-[#333]" : "bg-white ring-[#ebe6dc]"
        } ${mobile ? "text-xs" : "text-sm"}`}
      >
        <div className="flex justify-between gap-2">
          <span className={dark ? "text-[#888]" : "text-[#888]"}>Serviços</span>
          <span className="text-right font-medium">{services.length}</span>
        </div>
        <ul
          className={`mt-2 space-y-1 border-b pb-2 ${dark ? "border-[#333]" : "border-[#ebe6dc]"}`}
        >
          {services.map((s) => (
            <li key={s.id} className={`flex justify-between gap-2 ${dark ? "text-[#bbb]" : "text-[#555]"}`}>
              <span className="min-w-0 truncate">{s.name}</span>
              <span className="shrink-0">
                {s.duration_minutes} min · R$ {formatDemoPrice(s.price)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex justify-between gap-2">
          <span className="text-[#888]">Data</span>
          <span className="text-right">{dateLabel}</span>
        </div>
        <div className="mt-1.5 flex justify-between gap-2">
          <span className="text-[#888]">Horário</span>
          <span>{time}</span>
        </div>
        <div
          className={`mt-2 flex justify-between border-t pt-2 font-semibold ${
            dark ? "border-[#333]" : "border-[#ebe6dc]"
          }`}
        >
          <span>Total</span>
          <span>R$ {formatDemoPrice(totalPrice)}</span>
        </div>
      </div>
    </div>
  );
}

function DemoField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  mobile,
  dark,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mobile: boolean;
  dark?: boolean;
}) {
  return (
    <label className="block">
      <span className={`mb-1 block font-medium text-[#888] ${mobile ? "text-[10px]" : "text-xs"}`}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border outline-none transition focus:ring-2 ${
          dark
            ? "border-[#333] bg-[#1c1c1c] text-white focus:border-[#c9a227] focus:ring-[#c9a227]/20"
            : "border-[#ebe6dc] bg-white text-[#1a1a1a] focus:border-black focus:ring-black/10"
        } ${mobile ? "py-2.5 text-xs" : "py-3 text-sm"}`}
      />
    </label>
  );
}

function DemoActions({
  mobile,
  step,
  canContinue,
  submitting,
  onBack,
  onContinue,
  dark,
  accent,
}: {
  mobile: boolean;
  step: DemoBookingStep;
  canContinue: boolean;
  submitting: boolean;
  onBack: () => void;
  onContinue: () => void;
  dark: boolean;
  accent: string;
}) {
  const showBack = step !== "servico";
  const isLast = step === "dados";

  return (
    <div
      className={`flex items-center justify-between ${
        mobile ? "mt-4 gap-3 pt-1" : "mt-6 gap-4 pt-2"
      }`}
    >
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1 hover:opacity-80 ${
            dark ? "text-[#aaa]" : "text-[#777] hover:text-[#1a1a1a]"
          } ${mobile ? "text-xs" : "text-sm"}`}
        >
          <ArrowLeft className="size-3.5" /> Voltar
        </button>
      ) : (
        <span className={`text-[#bbb] ${mobile ? "text-xs" : "text-sm"}`}>← Voltar</span>
      )}
      <button
        type="button"
        disabled={!canContinue || submitting}
        onClick={onContinue}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition disabled:opacity-40 ${
          dark ? "text-black hover:opacity-90" : "bg-black text-white hover:bg-[#222]"
        } ${mobile ? "min-h-10 flex-1 px-4 text-xs" : "min-h-11 px-6 text-sm"}`}
        style={dark ? { backgroundColor: accent } : undefined}
      >
        {submitting ? "Confirmando…" : isLast ? "Confirmar agendamento" : "Continuar"}
        <ArrowRight className={mobile ? "size-3.5" : "size-4"} />
      </button>
    </div>
  );
}

function DemoConfirmed({
  mobile,
  demo,
  services,
  provider,
  totalPrice,
  totalDurationMinutes,
  date,
  time,
  onRestart,
}: {
  mobile: boolean;
  demo: DemoShowcase;
  services: ReturnType<typeof getSelectedServices>;
  provider: DemoProvider | null;
  totalPrice: number;
  totalDurationMinutes: number;
  date: string;
  time: string;
  onRestart: () => void;
}) {
  const dark = demo.theme === "dark";
  const dateFmt = new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className={`text-center ${mobile ? "py-4" : "py-8"}`}>
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#e8f5e9]">
        <Check className="size-7 text-[#2e7d32]" />
      </div>
      <h2
        className={`mt-4 font-display font-bold ${dark ? "text-white" : "text-[#1a1a1a]"} ${
          mobile ? "text-lg" : "text-2xl"
        }`}
      >
        Agendamento confirmado!
      </h2>
      <p className={`mt-2 ${dark ? "text-[#aaa]" : "text-[#888]"} ${mobile ? "text-xs" : "text-sm"}`}>
        Demonstração concluída — nenhum dado foi enviado ao sistema.
      </p>
      <div
        className={`mt-5 space-y-2 rounded-xl p-4 text-left ring-1 ${
          dark ? "bg-[#1c1c1c] ring-[#333]" : "bg-white ring-[#ebe6dc]"
        } ${mobile ? "text-xs" : "text-sm"}`}
      >
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Estúdio</span>
          <span className="font-medium">{demo.studio.name}</span>
        </div>
        {provider ? (
          <div className="flex justify-between gap-2">
            <span className="text-[#888]">Barbeiro</span>
            <span className="font-medium">{provider.name}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Serviços</span>
          <span>{services.length}</span>
        </div>
        <ul className={`space-y-1 border-b pb-2 ${dark ? "border-[#333]" : "border-[#ebe6dc]"}`}>
          {services.map((s) => (
            <li key={s.id} className={`flex justify-between gap-2 ${dark ? "text-[#bbb]" : "text-[#555]"}`}>
              <span className="min-w-0 truncate">{s.name}</span>
              <span className="shrink-0">{s.duration_minutes} min</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Data</span>
          <span>{dateFmt}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Início</span>
          <span>{time}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Duração</span>
          <span>{totalDurationMinutes} min</span>
        </div>
        <div
          className={`flex justify-between gap-2 border-t pt-2 font-semibold ${
            dark ? "border-[#333]" : "border-[#ebe6dc]"
          }`}
        >
          <span>Total</span>
          <span>R$ {formatDemoPrice(totalPrice)}</span>
        </div>
      </div>
      <div className={`mt-5 flex flex-col gap-2 ${mobile ? "" : "items-center"}`}>
        <Link
          to="/cadastro"
          className={`inline-flex items-center justify-center gap-2 rounded-full px-5 font-medium hover:opacity-90 ${
            dark ? "text-black" : "bg-black text-white hover:bg-[#222]"
          } ${mobile ? "min-h-10 text-xs" : "min-h-11 text-sm"}`}
          style={dark ? { backgroundColor: demo.accent } : undefined}
        >
          {demo.ctaSignupLabel}
          <ArrowRight className="size-4" />
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className={`underline-offset-2 hover:underline ${
            dark ? "text-[#aaa] hover:text-white" : "text-[#888] hover:text-[#1a1a1a]"
          } ${mobile ? "text-xs" : "text-sm"}`}
        >
          Refazer demonstração
        </button>
      </div>
    </div>
  );
}

function DemoFooterImage({ demo }: { demo: DemoShowcase }) {
  if (!demo.assets.footer) {
    return (
      <div
        className="flex h-16 items-center justify-center border-t text-xs tracking-widest uppercase"
        style={{
          borderColor: demo.theme === "dark" ? "#2a2a2a" : "#ebe6dc",
          color: demo.accent,
          background: demo.theme === "dark" ? "#0c0c0c" : "#f7f2ea",
        }}
      >
        {demo.studio.name}
      </div>
    );
  }
  return (
    <img
      src={demo.assets.footer}
      alt=""
      width={797}
      height={105}
      className="block h-auto w-full"
      decoding="async"
    />
  );
}
