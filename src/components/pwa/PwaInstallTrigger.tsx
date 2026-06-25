import { useState } from "react";
import { Download, Smartphone, Share, PlusSquare, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import type { PwaManifestOptions } from "@/lib/pwa-install";
import { getPwaInstallLabel, isIosDevice } from "@/lib/pwa-install";
import { IosInstallGuideVisual } from "@/components/pwa/IosInstallGuideVisual";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  manifest: PwaManifestOptions;
  label?: string;
  variant?: "pill" | "button" | "card";
  className?: string;
  primaryColor?: string;
};

export function PwaInstallTrigger({
  manifest,
  label,
  variant = "pill",
  className,
  primaryColor,
}: Props) {
  const isIos = isIosDevice();
  const installLabel = label ?? getPwaInstallLabel(isIos);
  const { installed, install, iosGuideOpen, setIosGuideOpen } = usePwaInstall(manifest);

  const onClick = () => {
    void install();
  };

  if (installed) {
    if (variant === "pill") {
      return (
        <span
          className={cn(
            "public-booking-pill inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2.5 text-sm opacity-80",
            className,
          )}
        >
          <Smartphone className="size-4 shrink-0" />
          <span className="font-medium">App instalado</span>
        </span>
      );
    }
    return (
      <div className={cn("rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground", className)}>
        <Smartphone className="mr-2 inline size-4" />
        App já instalado neste dispositivo.
      </div>
    );
  }

  const iosDialog = (
    <IosInstallDialog
      open={iosGuideOpen}
      onOpenChange={setIosGuideOpen}
      appName={manifest.appName}
      isIos={isIos}
    />
  );

  if (variant === "pill") {
    return (
      <>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "public-booking-pill public-booking-pill--muted inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2.5 text-sm transition hover:opacity-90",
            className,
          )}
          style={
            primaryColor
              ? { borderColor: `${primaryColor}33`, color: primaryColor }
              : undefined
          }
        >
          {isIos ? (
            <PlusSquare className="size-4 shrink-0 opacity-90" />
          ) : (
            <Download className="size-4 shrink-0 opacity-90" />
          )}
          <span className="font-medium">{installLabel}</span>
        </button>
        {iosDialog}
      </>
    );
  }

  if (variant === "button") {
    return (
      <>
        <Button type="button" onClick={onClick} className={cn("rounded-full gap-2", className)}>
          {isIos ? <PlusSquare className="size-4" /> : <Download className="size-4" />}
          {installLabel}
        </Button>
        {iosDialog}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-card p-5 shadow-soft",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold">Instalar aplicativo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isIos
                ? "Atalho na tela inicial — abre direto a página de agendamento do salão."
                : "Acesso rápido na tela inicial do celular — funciona como um app nativo."}
            </p>
            <Button type="button" className="mt-4 rounded-full gap-2" onClick={onClick}>
              {isIos ? <PlusSquare className="size-4" /> : <Download className="size-4" />}
              {installLabel}
            </Button>
          </div>
        </div>
      </div>
      {iosDialog}
    </>
  );
}

function IosInstallDialog({
  open,
  onOpenChange,
  appName,
  isIos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appName?: string;
  isIos: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleOpenChange = (v: boolean) => {
    if (!v) setStep(1);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isIos ? "Instalar na tela inicial" : "Instalar app"}
            {appName?.trim() ? ` — ${appName.trim()}` : ""}
          </DialogTitle>
          <DialogDescription>
            {isIos
              ? "Use o Safari (não o navegador do Instagram/WhatsApp). Siga os 3 passos:"
              : "Se o botão de instalação não apareceu, use o menu do navegador."}
          </DialogDescription>
        </DialogHeader>

        {isIos ? (
          <>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStep(n)}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-xs font-medium transition",
                    step === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  Passo {n}
                </button>
              ))}
            </div>
            <IosInstallGuideVisual appName={appName} step={step} />
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">Compartilhar</strong> — ícone na barra inferior do Safari
                </span>
              </li>
              <li className="flex items-start gap-2">
                <PlusSquare className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">Adicionar à Tela de Início</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Toque em <strong className="text-foreground">Adicionar</strong> — o ícone abrirá o agendamento do
                  salão
                </span>
              </li>
            </ol>
            {step < 3 ? (
              <Button type="button" className="w-full rounded-full gap-2" onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}>
                Próximo passo
                <ChevronRight className="size-4" />
              </Button>
            ) : null}
          </>
        ) : (
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Share className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Menu do navegador → <strong className="text-foreground">Instalar app</strong> ou{" "}
                <strong className="text-foreground">Adicionar à tela inicial</strong>
              </span>
            </li>
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
