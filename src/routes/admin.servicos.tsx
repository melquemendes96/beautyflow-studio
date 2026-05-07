import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { servicos } from "@/lib/mock";
import { Plus, Pencil, Power } from "lucide-react";

export const Route = createFileRoute("/admin/servicos")({
  component: Servicos,
});

function Servicos() {
  return (
    <div>
      <PageTitle
        title="Serviços"
        subtitle="Gerencie seu catálogo de serviços"
        action={
          <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background">
            <Plus className="size-4" /> Novo serviço
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {servicos.map((s) => (
          <div key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:shadow-elegant">
            <div className="relative h-36">
              <img src={s.img} className="size-full object-cover" alt={s.nome} />
              <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] ${s.ativo ? "bg-success/90 text-background" : "bg-muted text-muted-foreground"}`}>
                {s.ativo ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="p-5">
              <div className="text-xs text-gold uppercase tracking-wider">{s.categoria}</div>
              <h3 className="mt-1 font-display text-lg">{s.nome}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.descricao}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-medium">R$ {s.preco}</span>
                <span className="text-xs text-muted-foreground">{s.duracao} min</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs hover:bg-accent">
                  <Pencil className="size-3.5" /> Editar
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs hover:bg-accent">
                  <Power className="size-3.5" /> {s.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
