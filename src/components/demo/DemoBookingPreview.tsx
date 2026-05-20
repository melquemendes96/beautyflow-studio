import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import {
  DEMO_ASSETS,
  DEMO_BOOKING_STEPS,
  DEMO_SHOWCASE,
  formatDemoPrice,
  type DemoBookingStep,
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
export function DemoBookingPreview({ variant }: { variant: Variant }) {
  const mobile = variant === "mobile";
  const [step, setStep] = useState<DemoBookingStep>("servico");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "" });
  const [submitting, setSubmitting] = useState(false);

  const selectedServices = useMemo(() => getSelectedServices(serviceIds), [serviceIds]);
  const totalDurationMinutes = useMemo(() => getTotalDurationMinutes(serviceIds), [serviceIds]);
  const totalPrice = useMemo(() => getTotalPrice(serviceIds), [serviceIds]);
  const stepIndex = DEMO_BOOKING_STEPS.indexOf(step === "confirmado" ? "dados" : step);

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
    setDate(null);
    setTime(null);
    setForm({ nome: "", email: "", whatsapp: "" });
  };

  const goBack = () => {
    const i = DEMO_BOOKING_STEPS.indexOf(step as (typeof DEMO_BOOKING_STEPS)[number]);
    if (i > 0) setStep(DEMO_BOOKING_STEPS[i - 1]!);
  };

  const canContinue =
    (step === "servico" && serviceIds.length > 0) ||
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

  const handleContinue = async () => {
    if (!canContinue) return;
    const i = DEMO_BOOKING_STEPS.indexOf(step as (typeof DEMO_BOOKING_STEPS)[number]);
    if (i < DEMO_BOOKING_STEPS.length - 1) {
      setStep(DEMO_BOOKING_STEPS[i + 1]!);
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    setStep("confirmado");
    toast.success("Demonstração: agendamento simulado com sucesso!");
  };

  return (
    <div
      className={
        mobile
          ? "demo-preview demo-preview--mobile bg-[#fdf9f4]"
          : "demo-preview demo-preview--desktop overflow-hidden rounded-[20px] bg-[#fdf9f4] shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
      }
    >
      {step !== "confirmado" ? (
        <>
          <DemoHero mobile={mobile} />
          <DemoStudioCard mobile={mobile} />
          <DemoStepper activeIndex={stepIndex} mobile={mobile} />
        </>
      ) : null}

      <div className={mobile ? "px-3 pb-4" : "px-4 pb-4 md:px-5"}>
        {step === "confirmado" ? (
          <DemoConfirmed
            mobile={mobile}
            services={selectedServices}
            totalPrice={totalPrice}
            totalDurationMinutes={totalDurationMinutes}
            date={date!}
            time={time!}
            onRestart={resetDemo}
          />
        ) : (
          <>
            <StepHeading step={step} mobile={mobile} />
            {step === "servico" && (
              <>
                <p className={`mb-3 text-[#888] ${mobile ? "text-xs" : "text-sm"}`}>
                  Selecione um ou mais serviços. A duração total será somada no agendamento.
                </p>
                <ServiceGrid
                  mobile={mobile}
                  selectedIds={serviceIds}
                  onToggle={toggleService}
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
              />
            )}
            {step === "horario" && (
              <TimeGrid
                selected={time}
                onSelect={handleTimeSelect}
                mobile={mobile}
                totalDurationMinutes={totalDurationMinutes}
                serviceCount={serviceIds.length}
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
              />
            )}
            <DemoActions
              mobile={mobile}
              step={step}
              canContinue={canContinue}
              submitting={submitting}
              onBack={goBack}
              onContinue={handleContinue}
            />
          </>
        )}
      </div>

      {!mobile && step !== "confirmado" ? <DemoFooterImage /> : null}
    </div>
  );
}

function DemoHero({ mobile }: { mobile: boolean }) {
  return (
    <div
      className={`relative overflow-hidden bg-black ${
        mobile ? "min-h-[188px]" : "min-h-[220px] rounded-t-[20px]"
      }`}
    >
      <img
        src={DEMO_ASSETS.banner}
        alt=""
        className="absolute inset-0 size-full object-cover object-center"
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
            <span className="block">{DEMO_SHOWCASE.hero.titleLine1}</span>
            <span className="mt-0.5 block text-[#d4af37]">{DEMO_SHOWCASE.hero.titleLine2}</span>
          </h1>
          <p
            className={`mt-2 whitespace-pre-line leading-snug text-white/85 ${
              mobile ? "text-[10px]" : "text-sm"
            }`}
          >
            {DEMO_SHOWCASE.hero.subtitle}
          </p>
          <ul className={`mt-3 flex ${mobile ? "gap-4" : "mt-4 gap-8"}`}>
            {DEMO_SHOWCASE.hero.badges.map((label, i) => {
              const Icon = BADGE_ICONS[i] ?? Star;
              return (
                <li key={label} className="flex flex-col items-center gap-1 text-center">
                  <Icon className="size-5 text-[#d4af37]" strokeWidth={1.75} />
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

function DemoStudioCard({ mobile }: { mobile: boolean }) {
  const s = DEMO_SHOWCASE.studio;
  return (
    <div
      className={`relative z-10 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${
        mobile ? "-mt-4 mx-3 rounded-2xl p-4" : "-mt-8 mx-4 rounded-2xl p-5 md:mx-5 md:p-6"
      }`}
    >
      {mobile ? (
        <>
          <div className="flex gap-3">
            <img
              src={DEMO_ASSETS.logo}
              alt=""
              className="size-[72px] shrink-0 rounded-xl object-cover"
              width={72}
              height={72}
            />
            <div className="min-w-0 pt-1">
              <h2 className="font-display text-base font-bold text-[#1a1a1a]">{s.name}</h2>
              <p className="mt-0.5 text-[11px] text-[#888]">{s.slogan}</p>
            </div>
          </div>
          <div className="mt-3">
            <StudioDetails centered />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-6 md:grid-cols-[160px_minmax(0,1fr)] md:gap-8">
          <img
            src={DEMO_ASSETS.logo}
            alt=""
            className="size-[140px] rounded-2xl object-cover md:size-[160px]"
            width={160}
            height={160}
          />
          <div>
            <h2 className="font-display text-xl font-bold text-[#1a1a1a] md:text-2xl">{s.name}</h2>
            <p className="mt-1 text-sm text-[#888]">{s.slogan}</p>
            <div className="mt-4">
              <StudioDetails />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudioDetails({ centered }: { centered?: boolean }) {
  const s = DEMO_SHOWCASE.studio;
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
      <p className={`text-xs leading-relaxed text-[#555] ${centered ? "max-w-[260px]" : "max-w-lg"}`}>
        {s.description}
      </p>
      <div className={`flex flex-col gap-1.5 text-xs text-[#777] ${centered ? "items-center" : ""}`}>
        <span className="inline-flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#c9a960]" />
          {s.address}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0 text-[#c9a960]" />
          {s.hours}
        </span>
      </div>
    </div>
  );
}

function DemoStepper({ activeIndex, mobile }: { activeIndex: number; mobile: boolean }) {
  return (
    <div className={`flex justify-center bg-[#fdf9f4] ${mobile ? "py-4" : "py-5"}`}>
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`grid place-items-center rounded-full font-semibold ${
                mobile ? "size-7 text-[11px]" : "size-8 text-xs"
              } ${i <= activeIndex ? "bg-black text-white" : "bg-[#e8e4dc] text-[#999]"}`}
            >
              {i + 1}
            </span>
            {i < 3 ? (
              <span
                className={`h-px bg-[#ddd8ce] ${mobile ? "w-5" : "w-10"} ${
                  i < activeIndex ? "bg-black/30" : ""
                }`}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepHeading({ step, mobile }: { step: DemoBookingStep; mobile: boolean }) {
  const titles: Record<Exclude<DemoBookingStep, "confirmado">, string> = {
    servico: "Escolha o serviço",
    data: "Escolha a data",
    horario: "Escolha o horário de início",
    dados: "Seus dados",
  };
  if (step === "confirmado") return null;
  return (
    <h2
      className={`font-display font-bold text-[#1a1a1a] ${
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
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-xl object-cover object-center shadow-[0_1px_6px_rgba(0,0,0,0.08)]`}
    />
  );
}

function ServiceGrid({
  mobile,
  selectedIds,
  onToggle,
}: {
  mobile: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`grid gap-3 ${mobile ? "grid-cols-1" : "grid-cols-2 gap-4"}`}>
      {DEMO_SHOWCASE.services.map((s) => {
        const selected = selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`group flex items-center rounded-xl border bg-white text-left transition ${
              mobile ? "min-h-[5.25rem] gap-3.5 p-3" : "min-h-[6.5rem] gap-4 p-3.5 md:p-4"
            } ${
              selected
                ? "border-[#1a1a1a] shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                : "border-[#ebe6dc] hover:border-[#d4af37]/50 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            }`}
          >
            <ServiceThumb name={s.name} src={s.imageUrl} mobile={mobile} />
            <div className="min-w-0 flex-1">
              <div
                className={`font-semibold leading-snug text-[#1a1a1a] ${mobile ? "text-sm" : "text-[15px]"}`}
              >
                {s.name}
              </div>
              <div className={`text-[#888] ${mobile ? "text-xs" : "text-sm"}`}>
                {s.duration_minutes} min · R$ {formatDemoPrice(s.price)}
              </div>
            </div>
            {selected ? (
              <Check className="size-4 shrink-0 text-[#1a1a1a]" />
            ) : (
              <ChevronRight className={`shrink-0 text-[#ccc] ${mobile ? "size-4" : "size-5"}`} />
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
}: {
  selected: string | null;
  onSelect: (ymd: string) => void;
  mobile: boolean;
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
          className="grid size-8 place-items-center rounded-full text-[#666] transition hover:bg-white disabled:opacity-30"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-display text-base font-semibold capitalize text-[#1a1a1a] md:text-lg">
          {monthLabel}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => shiftMonth(1)}
          className="grid size-8 place-items-center rounded-full text-[#666] transition hover:bg-white disabled:opacity-30"
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div
        className={`grid grid-cols-7 gap-1.5 ${mobile ? "text-[9px]" : "text-xs"}`}
      >
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="text-center font-medium text-[#999]">
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
                  ? "cursor-not-allowed text-[#ccc]"
                  : sel
                    ? "bg-black font-medium text-white"
                    : cell.isToday
                      ? "bg-white font-semibold text-[#1a1a1a] ring-2 ring-[#d4af37]/70 hover:ring-[#d4af37]"
                      : "bg-white text-[#333] ring-1 ring-[#ebe6dc] hover:ring-[#d4af37]/60"
              } ${mobile ? "text-xs" : ""}`}
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
}: {
  selected: string | null;
  onSelect: (t: string) => void;
  mobile: boolean;
  totalDurationMinutes: number;
  serviceCount: number;
}) {
  const durationLabel =
    totalDurationMinutes >= 60
      ? `${Math.floor(totalDurationMinutes / 60)}h${totalDurationMinutes % 60 ? ` ${totalDurationMinutes % 60}min` : ""}`
      : `${totalDurationMinutes} min`;

  return (
    <div>
      <p className={`mb-3 text-[#888] ${mobile ? "text-xs" : "text-sm"}`}>
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
                  ? "border-black bg-black text-white"
                  : available
                    ? "border-[#ebe6dc] bg-white text-[#333] hover:border-[#d4af37]/60"
                    : "cursor-not-allowed border-[#ebe6dc] bg-[#f5f3ef] text-[#bbb] line-through decoration-[#ccc]"
              } ${mobile ? "text-xs" : ""}`}
            >
              {h}
            </button>
          );
        })}
      </div>
      <p className={`mt-3 text-[#999] ${mobile ? "text-[10px]" : "text-xs"}`}>
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
}: {
  mobile: boolean;
  form: { nome: string; email: string; whatsapp: string };
  onChange: (f: { nome: string; email: string; whatsapp: string }) => void;
  services: ReturnType<typeof getSelectedServices>;
  totalPrice: number;
  totalDurationMinutes: number;
  dateLabel: string;
  time: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className={`text-[#888] ${mobile ? "text-[11px]" : "text-sm"}`}>
        Preencha para confirmarmos seu agendamento (demonstração — nada é enviado ao servidor).
      </p>
      <DemoField
        label="Nome completo"
        value={form.nome}
        onChange={(nome) => onChange({ ...form, nome })}
        mobile={mobile}
      />
      <DemoField
        label="E-mail"
        type="email"
        value={form.email}
        onChange={(email) => onChange({ ...form, email })}
        mobile={mobile}
      />
      <DemoField
        label="WhatsApp"
        value={form.whatsapp}
        onChange={(whatsapp) => onChange({ ...form, whatsapp })}
        placeholder="(11) 99999-0000"
        mobile={mobile}
      />
      <div className={`rounded-xl bg-white p-4 ring-1 ring-[#ebe6dc] ${mobile ? "text-xs" : "text-sm"}`}>
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Serviços</span>
          <span className="text-right font-medium">{services.length}</span>
        </div>
        <ul className="mt-2 space-y-1 border-b border-[#ebe6dc] pb-2">
          {services.map((s) => (
            <li key={s.id} className="flex justify-between gap-2 text-[#555]">
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
        <div className="mt-2 flex justify-between border-t border-[#ebe6dc] pt-2 font-semibold">
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mobile: boolean;
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
        className={`w-full rounded-xl border border-[#ebe6dc] bg-white px-3 text-[#1a1a1a] outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 ${
          mobile ? "py-2.5 text-xs" : "py-3 text-sm"
        }`}
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
}: {
  mobile: boolean;
  step: DemoBookingStep;
  canContinue: boolean;
  submitting: boolean;
  onBack: () => void;
  onContinue: () => void;
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
          className={`inline-flex items-center gap-1 text-[#777] hover:text-[#1a1a1a] ${
            mobile ? "text-xs" : "text-sm"
          }`}
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
        className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-black font-medium text-white transition hover:bg-[#222] disabled:opacity-40 ${
          mobile ? "min-h-10 flex-1 px-4 text-xs" : "min-h-11 px-6 text-sm"
        }`}
      >
        {submitting ? "Confirmando…" : isLast ? "Confirmar agendamento" : "Continuar"}
        <ArrowRight className={mobile ? "size-3.5" : "size-4"} />
      </button>
    </div>
  );
}

function DemoConfirmed({
  mobile,
  services,
  totalPrice,
  totalDurationMinutes,
  date,
  time,
  onRestart,
}: {
  mobile: boolean;
  services: ReturnType<typeof getSelectedServices>;
  totalPrice: number;
  totalDurationMinutes: number;
  date: string;
  time: string;
  onRestart: () => void;
}) {
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
      <h2 className={`mt-4 font-display font-bold text-[#1a1a1a] ${mobile ? "text-lg" : "text-2xl"}`}>
        Agendamento confirmado!
      </h2>
      <p className={`mt-2 text-[#888] ${mobile ? "text-xs" : "text-sm"}`}>
        Demonstração concluída — nenhum dado foi enviado ao sistema.
      </p>
      <div
        className={`mt-5 space-y-2 rounded-xl bg-white p-4 text-left ring-1 ring-[#ebe6dc] ${
          mobile ? "text-xs" : "text-sm"
        }`}
      >
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Estúdio</span>
          <span className="font-medium">{DEMO_SHOWCASE.studio.name}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[#888]">Serviços</span>
          <span>{services.length}</span>
        </div>
        <ul className="space-y-1 border-b border-[#ebe6dc] pb-2">
          {services.map((s) => (
            <li key={s.id} className="flex justify-between gap-2 text-[#555]">
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
        <div className="flex justify-between gap-2 border-t border-[#ebe6dc] pt-2 font-semibold">
          <span>Total</span>
          <span>R$ {formatDemoPrice(totalPrice)}</span>
        </div>
      </div>
      <div className={`mt-5 flex flex-col gap-2 ${mobile ? "" : "items-center"}`}>
        <Link
          to="/cadastro"
          className={`inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 font-medium text-white hover:bg-[#222] ${
            mobile ? "min-h-10 text-xs" : "min-h-11 text-sm"
          }`}
        >
          Quero minha página assim
          <ArrowRight className="size-4" />
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className={`text-[#888] underline-offset-2 hover:text-[#1a1a1a] hover:underline ${
            mobile ? "text-xs" : "text-sm"
          }`}
        >
          Refazer demonstração
        </button>
      </div>
    </div>
  );
}

function DemoFooterImage() {
  return (
    <img
      src={DEMO_ASSETS.footer}
      alt=""
      width={797}
      height={105}
      className="block h-auto w-full"
      decoding="async"
    />
  );
}
