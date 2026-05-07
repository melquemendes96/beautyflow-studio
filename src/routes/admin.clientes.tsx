import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { clientes } from "@/lib/mock";
import { Search, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/clientes")({
  component: Clientes,
});

function Clientes() {
  return (
    <div>
      <PageTitle
        title="Clientes"
        subtitle={`${clientes.length} cadastradas`}
        action={
          <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background">
            <Plus className="size-4" /> Nova cliente
          </button>
        }
      />

      <div className="mb-4 relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Buscar por nome, e-mail ou WhatsApp"
          className="w-full rounded-full border border-input bg-card py-3 pl-11 pr-4 text-sm outline-none focus:border-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Contato</th>
              <th className="px-4 py-3 text-center">Atendimentos</th>
              <th className="px-4 py-3 text-center hidden sm:table-cell">Faltas</th>
              <th className="px-4 py-3 text-center hidden sm:table-cell">Cancelamentos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-accent/40 transition cursor-pointer">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-full bg-gradient-to-br from-gold to-rose grid place-items-center text-xs text-background font-medium">
                      {c.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground md:hidden">{c.whatsapp}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                  <div>{c.email}</div>
                  <div className="text-xs">{c.whatsapp}</div>
                </td>
                <td className="px-4 py-3 text-center font-medium">{c.atendimentos}</td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className={c.faltas > 0 ? "text-destructive" : "text-muted-foreground"}>{c.faltas}</span>
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className={c.cancelamentos > 0 ? "text-warning" : "text-muted-foreground"}>{c.cancelamentos}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
