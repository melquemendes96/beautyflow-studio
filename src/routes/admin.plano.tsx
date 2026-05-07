import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { planos } from "@/lib/mock";
import { Check } from "lucide-react";

export const Route = createFileRoute("/admin/plano")({
  component: Plano,
});

function Plano() {
  return (
    <div>
      <PageTitle title="Plano e assinatura" subtitle="Gerencie seu plano e método de pagamento" />

      <div className="mb-8 rounded-2xl border border-gold/30 bg-gradient-to-br from-foreground to-foreground/90 p-6 text-background shadow-elegant">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gold">Plano atual</div>
            <div className="mt-1 font-display text-3xl">Studio Pro</div>
            <div className="text-sm text-background/70">R$ 79/mês · Renova em 12 dias</div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-full border border-background/20 px-5 py-2.5 text-sm hover:bg-background/10">Atualizar pagamento</button>
            <button className="rounded-full bg-gold px-5 py-2.5 text-sm text-foreground hover:opacity-90">Fazer upgrade</button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {planos.map((p) => (
          <div
            key={p.id}
            className={`relative rounded-3xl border p-6 shadow-soft ${
              p.destaque ? "border-gold bg-gold-soft/40" : "border-border bg-card"
            }`}
          >
            {p.id === "pro" && (
              <span className="absolute right-4 top-4 rounded-full bg-success/15 px-2.5 py-1 text-[10px] text-success">Atual</span>
            )}
            <h3 className="font-display text-xl">{p.nome}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-3xl">R$ {p.preco}</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.slice(0, 5).map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 text-success shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button className="mt-6 w-full rounded-full border border-foreground py-2.5 text-sm hover:bg-foreground hover:text-background transition">
              {p.id === "pro" ? "Plano atual" : p.preco > 79 ? "Upgrade" : "Downgrade"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
