import { MoreVertical, Download, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type AndroidInstallGuideVisualProps = {
  appName?: string;
  className?: string;
};

/** Mock visual do Chrome Android para instalação PWA. */
export function AndroidInstallGuideVisual({ appName, className }: AndroidInstallGuideVisualProps) {
  const name = appName?.trim() || "Salão";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
          <span className="truncate text-[11px] font-medium text-muted-foreground">Chrome · {name}</span>
        </div>
        <div className="relative h-24 bg-gradient-to-b from-secondary/30 to-background px-4 pt-4">
          <div className="mx-auto h-3 w-20 rounded-full bg-muted" />
          <div className="mt-3 h-2 w-2/3 rounded bg-muted" />
        </div>
        <div className="border-t border-border bg-card p-2">
          <div className="flex items-center justify-end gap-2 px-2 py-1">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/15 ring-2 ring-primary ring-offset-2">
              <MoreVertical className="size-4 text-primary" />
            </div>
          </div>
          <p className="mt-1 text-center text-[10px] font-medium text-primary">Menu ⋮ (canto superior direito)</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <p className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">Menu do Chrome</p>
        <ul className="divide-y divide-border text-sm">
          <li className="px-3 py-2.5 text-muted-foreground">Nova guia</li>
          <li className="flex items-center gap-2 bg-primary/10 px-3 py-2.5 font-medium text-primary">
            <Download className="size-4 shrink-0" />
            Instalar app
          </li>
          <li className="px-3 py-2.5 text-muted-foreground">Adicionar à tela inicial</li>
        </ul>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/30 p-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-black text-white">
          <Smartphone className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">Ícone na tela inicial — abre como app</p>
        </div>
      </div>
    </div>
  );
}
