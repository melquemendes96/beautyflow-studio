import { Share, PlusSquare, Smartphone, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type IosInstallGuideVisualProps = {
  appName?: string;
  step?: 1 | 2 | 3;
  className?: string;
};

/** Mock visual do Safari (iOS) para o tutorial de instalação PWA. */
export function IosInstallGuideVisual({ appName, step = 1, className }: IosInstallGuideVisualProps) {
  const name = appName?.trim() || "Salão";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
          <span className="truncate text-[11px] font-medium text-muted-foreground">Safari · {name}</span>
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">AA</span>
        </div>
        <div className="relative h-28 bg-gradient-to-b from-secondary/30 to-background px-4 pt-4">
          <div className="mx-auto h-3 w-16 rounded-full bg-muted" />
          <div className="mt-4 space-y-2">
            <div className="h-2 w-3/4 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted/70" />
          </div>
          {step === 1 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1">
              <ChevronUp className="size-5 animate-bounce text-primary" aria-hidden />
            </div>
          ) : null}
        </div>
        <div className="relative border-t border-border bg-[#f2f2f7] px-2 py-2 dark:bg-zinc-900">
          <div className="flex items-end justify-around gap-1">
            {["←", "→", "↗", "📖", "◻"].map((sym, i) => (
              <div
                key={sym}
                className={cn(
                  "grid size-9 place-items-center rounded-lg text-xs text-muted-foreground",
                  step === 1 && i === 2 && "ring-2 ring-primary ring-offset-2 ring-offset-[#f2f2f7] dark:ring-offset-zinc-900",
                )}
              >
                {i === 2 ? <Share className="size-4 text-primary" strokeWidth={2.25} /> : sym}
              </div>
            ))}
          </div>
          {step === 1 ? (
            <p className="mt-2 text-center text-[10px] font-medium text-primary">Toque em Compartilhar</p>
          ) : null}
        </div>
      </div>

      {step >= 2 ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
          <p className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">
            Opções do Safari
          </p>
          <ul className="divide-y divide-border text-sm">
            <li className="px-3 py-2.5 text-muted-foreground">Copiar</li>
            <li className="px-3 py-2.5 text-muted-foreground">Adicionar aos Favoritos</li>
            <li
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 font-medium",
                step === 2 ? "bg-primary/10 text-primary" : "text-foreground",
              )}
            >
              <PlusSquare className="size-4 shrink-0" />
              Adicionar à Tela de Início
            </li>
          </ul>
        </div>
      ) : null}

      {step >= 3 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/30 p-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-black text-white">
            <Smartphone className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-[11px] text-muted-foreground">jmbeautyflow.tech</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            Adicionar
          </span>
        </div>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        No iPhone, a Apple exige estes passos — não há download automático como na App Store.
      </p>
    </div>
  );
}
