import { createFileRoute, Link } from "@tanstack/react-router";
import { meusAtendimentos, statusClass, statusLabel } from "@/lib/mock";
import { Logo } from "@/components/brand/Logo";
import { Calendar, Star, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/cliente")({
  component: Cliente,
});

function Cliente() {
  const proximo = meusAtendimentos.find((a) => a.proximo);
  const historico = meusAtendimentos.filter((a) => !a.proximo);

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/"><Logo className="h-9" /></Link>
          <div className="size-9 rounded-full bg-gradient-to-br from-gold to-rose grid place-items-center text-sm text-background font-medium">M</div>
        </div>
      </header>

      <main className="container-page max-w-2xl py-8">
        <h1 className="font-display text-3xl">Meus atendimentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe seus agendamentos e histórico de serviços.</p>

        {proximo && (
          <div className="mt-6 overflow-hidden rounded-3xl bg-foreground p-6 text-background shadow-elegant">
            <div className="text-xs uppercase tracking-widest text-gold">Próximo atendimento</div>
            <div className="mt-2 font-display text-2xl">{proximo.servico}</div>
            <div className="mt-1 text-background/70">{proximo.data} · {proximo.hora}</div>
            <div className="mt-1 text-sm text-background/60">{proximo.empresa}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="rounded-full bg-gold px-5 py-2.5 text-sm text-foreground hover:opacity-90">Reagendar</button>
              <button className="rounded-full border border-background/20 px-5 py-2.5 text-sm hover:bg-background/10">Cancelar</button>
              <button className="rounded-full border border-background/20 px-5 py-2.5 text-sm hover:bg-background/10 inline-flex items-center gap-1.5">
                <Calendar className="size-4" /> Calendário
              </button>
            </div>
          </div>
        )}

        <h2 className="mt-10 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-widest">Histórico</h2>
        <div className="space-y-3">
          {historico.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{a.servico}</div>
                  <div className="text-xs text-muted-foreground">{a.data} · {a.hora}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${statusClass[a.status]}`}>
                  {statusLabel[a.status]}
                </span>
              </div>
              {a.avaliacao && (
                <div className="mt-3 flex gap-1 text-gold">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`size-4 ${i < a.avaliacao! ? "fill-current" : ""}`} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <Link
          to="/agendar/$slug"
          params={{ slug: "joyce-mendes" }}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm text-background"
        >
          Novo agendamento <ArrowRight className="size-4" />
        </Link>
      </main>
    </div>
  );
}
