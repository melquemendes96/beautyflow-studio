import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { empresa, servicos } from "@/lib/mock";
import { Instagram, MessageCircle, MapPin, Clock, Star, Check, ArrowLeft, ArrowRight, Calendar } from "lucide-react";

export const Route = createFileRoute("/agendar/$slug")({
  component: Agendar,
});

type Step = "servico" | "data" | "horario" | "dados" | "confirmado";

function Agendar() {
  const [step, setStep] = useState<Step>("servico");
  const [servico, setServico] = useState<string | null>(null);
  const [data, setData] = useState<number | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "" });

  const servicoSel = servicos.find((s) => s.id === servico);

  if (step === "confirmado") return <Confirmado servico={servicoSel?.nome || ""} data={data!} hora={hora!} />;

  return (
    <div className="min-h-screen bg-secondary/30">
      {/* Cover banner */}
      <div className="relative h-48 md:h-64 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground/90 to-gold/40" />
        <img
          src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600"
          alt=""
          className="size-full object-cover opacity-40"
        />
      </div>

      <div className="container-page -mt-20 pb-16">
        {/* Studio card */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant md:p-8">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <div className="-mt-16 grid size-24 place-items-center rounded-3xl border-4 border-background bg-background shadow-soft md:-mt-20 md:size-28">
              <Logo className="h-14 md:h-16" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl">{empresa.nome}</h1>
              <p className="text-sm text-muted-foreground">{empresa.slogan}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <Star className="size-3.5 fill-gold text-gold" /> 4.9 · 320 avaliações
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs"><Instagram className="size-3.5" /> {empresa.instagram}</a>
              <a className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs text-success"><MessageCircle className="size-3.5" /> WhatsApp</a>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{empresa.boasVindas}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> {empresa.endereco}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> Seg–Sáb · 09h às 19h</span>
          </div>
        </div>

        {/* Stepper */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs">
          {(["servico", "data", "horario", "dados"] as Step[]).map((s, i) => {
            const idx = ["servico", "data", "horario", "dados"].indexOf(step);
            const active = i <= idx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`grid size-7 place-items-center rounded-full text-[11px] ${active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                {i < 3 && <div className={`h-px w-6 md:w-10 ${active && i < idx ? "bg-foreground" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
          {step === "servico" && (
            <>
              <h2 className="font-display text-xl">Escolha o serviço</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {servicos.filter((s) => s.ativo).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setServico(s.id)}
                    className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${servico === s.id ? "border-foreground bg-secondary/60 shadow-soft" : "border-border hover:border-foreground/30"}`}
                  >
                    <img src={s.img} alt="" className="size-16 rounded-xl object-cover" />
                    <div className="flex-1">
                      <div className="font-medium">{s.nome}</div>
                      <div className="text-xs text-muted-foreground">{s.duracao} min · R$ {s.preco}</div>
                    </div>
                    {servico === s.id && <Check className="size-5 text-success" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "data" && (
            <>
              <h2 className="font-display text-xl">Escolha a data</h2>
              <div className="mt-5 grid grid-cols-7 gap-2 text-xs text-muted-foreground">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="text-center">{d}</div>)}
                {Array.from({ length: 35 }).map((_, i) => {
                  const day = i - 2;
                  const isPast = day < 6;
                  const isFull = day === 12;
                  const valid = day > 0 && day <= 30;
                  const sel = data === day;
                  return (
                    <button
                      key={i}
                      disabled={!valid || isPast || isFull}
                      onClick={() => setData(day)}
                      className={`aspect-square rounded-xl text-sm transition ${
                        !valid ? "" :
                        sel ? "bg-foreground text-background shadow-soft" :
                        isPast ? "bg-muted/50 text-muted-foreground/50 line-through" :
                        isFull ? "bg-destructive/10 text-destructive/60" :
                        "bg-success/10 text-foreground hover:bg-success/20"
                      }`}
                    >
                      {valid ? day : ""}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-success/30" /> Disponível</span>
                <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-destructive/30" /> Lotado</span>
                <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-muted" /> Indisponível</span>
              </div>
            </>
          )}

          {step === "horario" && (
            <>
              <h2 className="font-display text-xl">Escolha o horário</h2>
              <div className="mt-5 grid grid-cols-3 gap-2 md:grid-cols-5">
                {["09:00", "09:45", "10:30", "11:15", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45"].map((h, i) => {
                  const indisp = i === 2 || i === 6;
                  const sel = hora === h;
                  return (
                    <button
                      key={h}
                      disabled={indisp}
                      onClick={() => setHora(h)}
                      className={`rounded-xl border px-3 py-3 text-sm transition ${
                        sel ? "border-foreground bg-foreground text-background" :
                        indisp ? "border-destructive/15 bg-destructive/5 text-muted-foreground line-through" :
                        "border-border bg-success/10 hover:border-foreground/40"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "dados" && (
            <>
              <h2 className="font-display text-xl">Seus dados</h2>
              <p className="mt-1 text-sm text-muted-foreground">Para confirmarmos seu agendamento.</p>
              <div className="mt-5 grid gap-4">
                <Field label="Nome completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                <Field label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} placeholder="(11) 99999-0000" />
              </div>
              <div className="mt-6 rounded-2xl bg-secondary/60 p-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Serviço</span><span>{servicoSel?.nome}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Data</span><span>{data} de maio</span></div>
                <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Horário</span><span>{hora}</span></div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium"><span>Total</span><span>R$ {servicoSel?.preco}</span></div>
              </div>
            </>
          )}

          {/* Nav */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => {
                const order: Step[] = ["servico", "data", "horario", "dados"];
                const i = order.indexOf(step);
                if (i > 0) setStep(order[i - 1]);
              }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Voltar
            </button>
            <button
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
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm text-background shadow-soft transition hover:opacity-90 disabled:opacity-30"
            >
              {step === "dados" ? "Confirmar agendamento" : "Continuar"} <ArrowRight className="size-4" />
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

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
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

function Confirmado({ servico, data, hora }: { servico: string; data: number; hora: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elegant">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/15">
          <Check className="size-8 text-success" />
        </div>
        <h1 className="mt-5 font-display text-2xl">Agendamento confirmado!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Você receberá uma mensagem no WhatsApp.</p>

        <div className="mt-6 space-y-2 rounded-2xl bg-secondary/60 p-5 text-left text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Estúdio</span><span>{empresa.nome}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Serviço</span><span>{servico}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{data} de maio</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Horário</span><span>{hora}</span></div>
        </div>

        <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm text-background">
          <Calendar className="size-4" /> Adicionar ao calendário
        </button>
        <Link to="/cliente" className="mt-3 inline-block w-full rounded-full border border-border bg-background px-5 py-3 text-sm">
          Ver meus atendimentos
        </Link>
        <Link to="/agendar/$slug" params={{ slug: "joyce-mendes" }} className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
          Voltar à página
        </Link>
      </div>
    </div>
  );
}
