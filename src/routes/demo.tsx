import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import { PublicStudioHero, getBrandingButtonStyle } from "@/components/booking/PublicStudioHero";
import { DEMO_BOOKING } from "@/lib/demo-booking-data";
import { normalizeHexColor } from "@/lib/branding-utils";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demonstração — JM BeautyFlow" },
      { name: "description", content: "Veja como funciona a página pública de agendamento do JM BeautyFlow." },
    ],
  }),
  component: DemoBooking,
});

type Step = "servico" | "data" | "horario" | "dados" | "confirmado";

function DemoBooking() {
  const [step, setStep] = useState<Step>("servico");
  const [servico, setServico] = useState<string | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "" });

  const branding = DEMO_BOOKING.branding;
  const primary = normalizeHexColor(branding.primary_color, "#1a1a1a");
  const btnStyle = getBrandingButtonStyle(primary);
  const servicoSel = DEMO_BOOKING.services.find((s) => s.id === servico);

  const dateLabel = useMemo(() => {
    if (!data) return "";
    return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [data]);

  if (step === "confirmado") {
    return (
      <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/15">
            <Check className="size-8 text-success" />
          </div>
          <h1 className="mt-5 font-display text-2xl">Demonstração concluída!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este é um fluxo de exemplo. No seu studio real, o cliente recebe confirmação no WhatsApp.
          </p>
          <Link
            to="/cadastro"
            className="mt-6 inline-flex w-full min-h-11 items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm text-background"
          >
            Criar minha conta grátis
          </Link>
          <Link to="/" className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground">
            Voltar à página inicial
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-secondary/30">
      <div className="border-b border-border/60 bg-background/90 px-4 py-2 text-center text-xs text-muted-foreground backdrop-blur">
        Modo demonstração — dados fictícios para visualização
      </div>
      <PublicStudioHero company={DEMO_BOOKING.company} branding={branding} />

      <div className="container-page pb-16">
        <div className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-8">
          {step === "servico" && (
            <>
              <h2 className="font-display text-xl">Escolha o serviço</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {DEMO_BOOKING.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setServico(s.id)}
                    className={`rounded-2xl border p-4 text-left text-sm transition ${
                      servico === s.id ? "border-foreground/40 bg-secondary/50" : "border-border"
                    }`}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.duration_minutes} min · R$ {s.price.toFixed(2).replace(".", ",")}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "data" && (
            <>
              <h2 className="font-display text-xl">Escolha a data</h2>
              <p className="mt-2 text-sm text-muted-foreground">Toque em um dia disponível (exemplo).</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4].map((offset) => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset + 1);
                  const ymd = d.toISOString().slice(0, 10);
                  const sel = data === ymd;
                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => setData(ymd)}
                      className={`min-h-11 rounded-xl px-4 py-2 text-sm ${sel ? "text-background" : "border border-border bg-background"}`}
                      style={sel ? btnStyle : undefined}
                    >
                      {d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "horario" && (
            <>
              <h2 className="font-display text-xl">Escolha o horário</h2>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {DEMO_BOOKING.slots.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHora(h)}
                    className={`min-h-11 rounded-xl text-sm ${hora === h ? "text-background" : "border border-border bg-background"}`}
                    style={hora === h ? btnStyle : undefined}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "dados" && (
            <>
              <h2 className="font-display text-xl">Seus dados</h2>
              <div className="mt-4 grid gap-3">
                <DemoField label="Nome" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                <DemoField label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <DemoField label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} />
              </div>
              {servicoSel && data && hora ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Resumo: {servicoSel.name} · {dateLabel} · {hora}
                </p>
              ) : null}
            </>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => {
                const order: Step[] = ["servico", "data", "horario", "dados"];
                const i = order.indexOf(step);
                if (i > 0) setStep(order[i - 1]);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-1 text-sm text-muted-foreground"
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
                else setStep("confirmado");
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm disabled:opacity-40"
              style={btnStyle}
            >
              {step === "dados" ? "Confirmar (demo)" : "Continuar"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:border-foreground"
      />
    </label>
  );
}
