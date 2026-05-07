import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/relatorios")({
  component: Relatorios,
});

const meses = [
  { m: "Jan", v: 42 }, { m: "Fev", v: 58 }, { m: "Mar", v: 72 },
  { m: "Abr", v: 65 }, { m: "Mai", v: 88 }, { m: "Jun", v: 95 },
];

const topServicos = [
  { n: "Lash Volume Brasileiro", v: 42 },
  { n: "Design de Sobrancelhas", v: 28 },
  { n: "Lash Lifting", v: 18 },
  { n: "Limpeza de Pele", v: 12 },
];

function Relatorios() {
  const max = Math.max(...meses.map((m) => m.v));
  return (
    <div>
      <PageTitle title="Relatórios" subtitle="Insights do seu studio" />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { l: "Faturamento estimado", v: "R$ 18.420", t: "+22% no trimestre" },
          { l: "Taxa de comparecimento", v: "94%", t: "Acima da média" },
          { l: "Clientes recorrentes", v: "68%", t: "+5% no mês" },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="mt-2 font-display text-3xl">{s.v}</div>
            <div className="text-xs text-success">{s.t}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h2 className="font-display text-xl">Atendimentos por mês</h2>
          <div className="mt-6 flex h-56 items-end gap-3">
            {meses.map((m) => (
              <div key={m.m} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-xl bg-gradient-to-t from-gold to-gold-soft transition hover:opacity-80"
                  style={{ height: `${(m.v / max) * 100}%` }}
                />
                <span className="text-xs text-muted-foreground">{m.m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl">Serviços mais agendados</h2>
          <div className="mt-5 space-y-4">
            {topServicos.map((s) => (
              <div key={s.n}>
                <div className="flex justify-between text-xs">
                  <span>{s.n}</span>
                  <span className="text-muted-foreground">{s.v}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-foreground" style={{ width: `${s.v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { l: "Horário mais procurado", v: "14:00 — 16:00" },
          { l: "Cancelamentos", v: "3 no mês", c: "text-warning" },
          { l: "Não comparecimentos", v: "1 no mês", c: "text-destructive" },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className={`mt-2 font-display text-2xl ${s.c || ""}`}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
