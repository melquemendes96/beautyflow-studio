import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { listaEspera } from "@/lib/mock";
import { MessageCircle, Calendar } from "lucide-react";

export const Route = createFileRoute("/admin/lista-espera")({
  component: Espera,
});

function Espera() {
  return (
    <div>
      <PageTitle title="Lista de espera" subtitle={`${listaEspera.length} clientes aguardando`} />
      <div className="space-y-3">
        {listaEspera.map((e) => (
          <div key={e.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium">{e.cliente}</div>
                <div className="mt-1 text-xs text-muted-foreground">{e.servico} · deseja em {e.data}</div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-success">
                  <MessageCircle className="size-3" /> {e.whatsapp}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs text-background">
                  <Calendar className="size-3.5" /> Converter em agendamento
                </button>
                <button className="rounded-full border border-border px-4 py-2 text-xs hover:bg-accent">Remover</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
