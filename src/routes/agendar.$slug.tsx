import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ArrowLeft, ArrowRight, Calendar } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { publicBookingService } from "@/services/publicBookingService";
import { PublicStudioHero, getBrandingButtonStyle } from "@/components/booking/PublicStudioHero";
import { displayStudioName, normalizeHexColor } from "@/lib/branding-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/agendar/$slug")({
  component: Agendar,
});

type Step = "servico" | "data" | "horario" | "dados" | "confirmado";

function Agendar() {
  const { slug } = Route.useParams();
  const [step, setStep] = useState<Step>("servico");
  const [servico, setServico] = useState<string | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "", notes: "" });

  const pageQuery = useQuery({
    queryKey: ["public", "booking_page", slug],
    queryFn: async () => {
      const res = await publicBookingService.getPageData(slug);
      if (res.error) throw res.error;
      return res.data as {
        company?: { id: string; name: string; slug: string } | null;
        branding?: Record<string, unknown> | null;
        services?: Array<{
          id: string;
          name: string;
          price?: number;
          duration_minutes?: number;
          image_url?: string | null;
        }>;
      } | null;
    },
  });

  const company = pageQuery.data?.company ?? null;
  const branding = pageQuery.data?.branding ?? null;
  const servicos = pageQuery.data?.services ?? [];
  const servicoSel = servicos.find((s) => s.id === servico);

  const slotsQuery = useQuery({
    queryKey: ["public", "available_slots", slug, servico, data],
    enabled: Boolean(servico && data),
    queryFn: async () => {
      const res = await publicBookingService.getAvailableSlots({
        slug,
        serviceId: servico!,
        date: data!,
      });
      if (res.error) throw res.error;
      return (res.data ?? []) as string[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!servico || !data || !hora) throw new Error("Dados incompletos");
      const res = await publicBookingService.createBooking({
        slug,
        serviceId: servico,
        appointmentDate: data,
        appointmentTime: hora,
        clientName: form.nome,
        clientEmail: form.email,
        clientWhatsapp: form.whatsapp,
        notes: form.notes || null,
      });
      if (res.error) throw res.error;
      return res.data as { ok?: boolean; error?: string };
    },
    onSuccess: (d) => {
      if (d?.ok === false) {
        if (d?.error === "horario_indisponivel") {
          toast.error("Esse horário acabou de ficar indisponível. Escolha outro horário.");
          return;
        }
        toast.error("Não foi possível criar o agendamento. Verifique os dados.");
        return;
      }
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
    return (
      <Confirmado
        slug={slug}
        studioName={studioName}
        servico={servicoSel?.name || ""}
        data={data!}
        hora={hora!}
        primaryColor={primary}
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

  if (pageQuery.isError || !company) {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
          <h1 className="font-display text-xl">Página não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este link de agendamento não existe ou o studio está indisponível.
          </p>
          <Link to="/" className="mt-6 inline-block text-sm text-foreground underline-offset-4 hover:underline">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <PublicStudioHero company={company} branding={branding as Parameters<typeof PublicStudioHero>[0]["branding"]} />

      <div className="container-page pb-16">
        <div className="mt-8 flex items-center justify-center gap-2 text-xs">
          {(["servico", "data", "horario", "dados"] as Step[]).map((s, i) => {
            const idx = ["servico", "data", "horario", "dados"].indexOf(step);
            const active = i <= idx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="grid size-7 place-items-center rounded-full text-[11px] text-background"
                  style={{
                    backgroundColor: active ? primary : undefined,
                    color: active ? "#fff" : undefined,
                    ...(active ? {} : { background: "var(--muted)", color: "var(--muted-foreground)" }),
                  }}
                >
                  {i + 1}
                </div>
                {i < 3 && (
                  <div
                    className="h-px w-6 md:w-10"
                    style={{ backgroundColor: active && i < idx ? primary : "var(--border)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
          {step === "servico" && (
            <>
              <h2 className="font-display text-xl">Escolha o serviço</h2>
              {servicos.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum serviço disponível no momento.</p>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {servicos.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setServico(s.id)}
                      className={`flex min-h-[5rem] items-center gap-4 rounded-2xl border p-4 text-left transition ${
                        servico === s.id ? "bg-secondary/60 shadow-soft" : "border-border hover:border-foreground/30"
                      }`}
                      style={servico === s.id ? { borderColor: primary } : undefined}
                    >
                      {s.image_url ? (
                        <img src={s.image_url} alt="" className="size-16 rounded-xl object-cover" />
                      ) : (
                        <div
                          className="grid size-16 shrink-0 place-items-center rounded-xl text-lg font-semibold text-background"
                          style={{ background: `linear-gradient(135deg, ${primary}, ${normalizeHexColor(typeof branding?.secondary_color === "string" ? branding.secondary_color : null, "#c9a960")})` }}
                        >
                          {s.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.duration_minutes ?? 0} min · R$ {Number(s.price ?? 0).toFixed(2).replace(".", ",")}
                        </div>
                      </div>
                      {servico === s.id && <Check className="size-5 text-success" />}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "data" && (
            <>
              <h2 className="font-display text-xl">Escolha a data</h2>
              <div className="mt-5 grid grid-cols-7 gap-2 text-xs text-muted-foreground">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <div key={i} className="text-center">
                    {d}
                  </div>
                ))}
                {Array.from({ length: 35 }).map((_, i) => {
                  const offset = i - 2;
                  const base = new Date();
                  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
                  const valid = offset >= 0 && offset < 30;
                  const ymd = toYmd(date);
                  const sel = data === ymd;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!valid}
                      onClick={() => setData(ymd)}
                      className={`aspect-square rounded-xl text-sm transition ${
                        !valid ? "" : sel ? "text-background shadow-soft" : "bg-success/10 text-foreground hover:bg-success/20"
                      }`}
                      style={valid && sel ? { backgroundColor: primary } : undefined}
                    >
                      {valid ? date.getDate() : ""}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "horario" && (
            <>
              <h2 className="font-display text-xl">Escolha o horário</h2>
              <div className="mt-5 grid grid-cols-3 gap-2 md:grid-cols-5">
                {(slotsQuery.data ?? []).map((h) => {
                  const sel = hora === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHora(h)}
                      className={`min-h-11 rounded-xl border px-3 py-3 text-sm transition ${
                        sel ? "border-transparent text-background" : "border-border bg-success/10 hover:border-foreground/40"
                      }`}
                      style={sel ? btnStyle : undefined}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
              {!slotsQuery.isLoading && (slotsQuery.data ?? []).length === 0 && (
                <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                  Sem horários disponíveis para essa data. Escolha outra data.
                </div>
              )}
            </>
          )}

          {step === "dados" && (
            <>
              <h2 className="font-display text-xl">Seus dados</h2>
              <p className="mt-1 text-sm text-muted-foreground">Para confirmarmos seu agendamento.</p>
              <div className="mt-5 grid gap-4">
                <Field label="Nome completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                <Field label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <Field
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChange={(v) => setForm({ ...form, whatsapp: v })}
                  placeholder="(11) 99999-0000"
                />
                <Field label="Observações (opcional)" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
              </div>
              <div className="mt-6 rounded-2xl bg-secondary/60 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviço</span>
                  <span>{servicoSel?.name}</span>
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
                  <span>Total</span>
                  <span>R$ {Number(servicoSel?.price ?? 0).toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            </>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                const order: Step[] = ["servico", "data", "horario", "dados"];
                const i = order.indexOf(step);
                if (i > 0) setStep(order[i - 1]);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Voltar
            </button>
            <button
              type="button"
              disabled={
                (step === "servico" && !servico) ||
                (step === "data" && !data) ||
                (step === "horario" && !hora) ||
                (step === "dados" && (!form.nome || !form.email || !form.whatsapp))
              }
              onClick={() => {
                const order: Step[] = ["servico", "data", "horario", "dados"];
                const i = order.indexOf(step);
                if (i < order.length - 1) setStep(order[i + 1]);
                else createMutation.mutate();
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm shadow-soft transition hover:opacity-90 disabled:opacity-30"
              style={btnStyle}
            >
              {step === "dados" ? (createMutation.isPending ? "Confirmando…" : "Confirmar agendamento") : "Continuar"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/cliente" className="text-xs text-muted-foreground hover:text-foreground">
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
}: {
  slug: string;
  studioName: string;
  servico: string;
  data: string;
  hora: string;
  primaryColor: string;
}) {
  const btnStyle = getBrandingButtonStyle(primaryColor);
  return (
    <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/15">
          <Check className="size-8 text-success" />
        </div>
        <h1 className="mt-5 font-display text-2xl">Agendamento confirmado!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Você receberá uma mensagem no WhatsApp.</p>

        <div className="mt-6 space-y-2 rounded-2xl bg-secondary/60 p-5 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estúdio</span>
            <span>{studioName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Serviço</span>
            <span>{servico}</span>
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

        <button type="button" className="mt-6 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm" style={btnStyle}>
          <Calendar className="size-4" /> Adicionar ao calendário
        </button>
        <Link to="/cliente" className="mt-3 inline-block w-full rounded-full border border-border bg-background px-5 py-3 text-sm">
          Ver meus atendimentos
        </Link>
        <Link to="/agendar/$slug" params={{ slug }} className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
          Voltar à página
        </Link>
      </div>
    </div>
  );
}

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
