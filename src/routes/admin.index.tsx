import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { agendaHoje, statusClass, statusLabel } from "@/lib/mock";
import { Calendar, Users, Wallet, TrendingUp, Sparkles, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

const stats = [
  { icon: Calendar, label: "Atendimentos hoje", value: "8", trend: "+2 vs ontem", color: "text-info" },
  { icon: Users, label: "Clientes cadastrados", value: "324", trend: "+12 esta semana", color: "text-purple-soft" },
  { icon: Wallet, label: "Faturamento estimado", value: "R$ 4.280", trend: "+18% no mês", color: "text-success" },
  { icon: TrendingUp, label: "Taxa de comparecimento", value: "94%", trend: "Excelente", color: "text-gold" },
];

function Dashboard() {
  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Visão geral do seu studio hoje" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`size-4 ${s.color}`} />
            </div>
            <div className="mt-3 font-display text-3xl">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.trend}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Agenda de hoje</h2>
            <span className="text-xs text-muted-foreground">5 horários</span>
          </div>
          <div className="mt-4 divide-y divide-border">
            {agendaHoje.map((a, i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <div className="w-14 text-sm font-medium">{a.hora}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.cliente}</div>
                  <div className="text-xs text-muted-foreground">{a.servico}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] ${statusClass[a.status]}`}>
                  {statusLabel[a.status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2 text-gold">
              <Sparkles className="size-4" />
              <h3 className="font-display text-lg">Serviço mais agendado</h3>
            </div>
            <div className="mt-3 text-2xl font-display">Lash Volume</div>
            <div className="text-xs text-muted-foreground">42% dos agendamentos</div>
          </div>

          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-4" />
              <h3 className="text-sm font-semibold">Alertas importantes</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <li>2 clientes na lista de espera para amanhã</li>
              <li>Sábado 14:00 confirmar com Camila</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
