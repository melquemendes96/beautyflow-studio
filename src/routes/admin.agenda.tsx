import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { agendaHoje, statusClass, statusLabel } from "@/lib/mock";
import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/agenda")({
  component: Agenda,
});

function Agenda() {
  const [view, setView] = useState<"dia" | "semana">("dia");

  return (
    <div>
      <PageTitle
        title="Agenda"
        subtitle="Quinta-feira, 7 de maio"
        action={
          <div className="flex gap-2">
            <div className="inline-flex rounded-full border border-border bg-card p-1">
              {(["dia", "semana"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-full px-4 py-1.5 text-xs capitalize ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background">
              <Plus className="size-4" /> Novo
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <button className="rounded-full border border-border bg-card p-2 hover:bg-accent"><ChevronLeft className="size-4" /></button>
        <button className="rounded-full border border-border bg-card p-2 hover:bg-accent"><ChevronRight className="size-4" /></button>
        <div className="flex flex-wrap gap-2 text-xs">
          {["Bloquear manhã", "Bloquear tarde", "Marcar dia lotado"].map((b) => (
            <button key={b} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 hover:bg-accent">
              <Lock className="size-3" /> {b}
            </button>
          ))}
        </div>
      </div>

      {view === "dia" ? (
        <div className="rounded-2xl border border-border bg-card p-2 shadow-soft">
          {Array.from({ length: 11 }).map((_, i) => {
            const hora = `${String(8 + i).padStart(2, "0")}:00`;
            const evento = agendaHoje.find((a) => a.hora === hora);
            return (
              <div key={hora} className="flex gap-4 border-b border-border last:border-0 px-3 py-3">
                <div className="w-14 pt-1 text-xs text-muted-foreground">{hora}</div>
                <div className="flex-1">
                  {evento ? (
                    <div className="rounded-xl bg-secondary/60 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{evento.cliente}</div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusClass[evento.status]}`}>{statusLabel[evento.status]}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{evento.servico}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        {["Concluir", "Reagendar", "Cancelar", "Não compareceu"].map((a) => (
                          <button key={a} className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent">{a}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Horário livre</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <div className="min-w-[700px] grid grid-cols-8 text-xs">
            <div />
            {["Seg 5", "Ter 6", "Qua 7", "Qui 8", "Sex 9", "Sáb 10", "Dom 11"].map((d) => (
              <div key={d} className="border-b border-l border-border p-3 text-center font-medium">{d}</div>
            ))}
            {["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"].map((h) => (
              <FragmentRow key={h} h={h} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ h }: { h: string }) {
  return (
    <>
      <div className="border-b border-border p-3 text-muted-foreground">{h}</div>
      {Array.from({ length: 7 }).map((_, c) => {
        const filled = (h.length + c) % 3 === 0;
        return (
          <div key={c} className="border-b border-l border-border p-2">
            {filled && <div className="rounded-md bg-foreground/90 px-2 py-1 text-[10px] text-background">Cliente</div>}
          </div>
        );
      })}
    </>
  );
}
