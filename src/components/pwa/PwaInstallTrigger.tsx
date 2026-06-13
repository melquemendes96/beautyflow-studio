import { Download, Smartphone, Share, PlusSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import type { PwaManifestOptions } from "@/lib/pwa-install";
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
  label = "Baixar app",
  variant = "pill",
  className,
  primaryColor,
}: Props) {
  const { installed, install, iosGuideOpen, setIosGuideOpen, isIos } = usePwaInstall(manifest);

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
          <Download className="size-4 shrink-0 opacity-90" />
          <span className="font-medium">{label}</span>
        </button>
        <IosInstallDialog open={iosGuideOpen} onOpenChange={setIosGuideOpen} appName={manifest.appName} isIos={isIos} />
      </>
    );
  }

  if (variant === "button") {
    return (
      <>
        <Button type="button" onClick={onClick} className={cn("rounded-full gap-2", className)}>
          <Download className="size-4" />
          {label}
        </Button>
        <IosInstallDialog open={iosGuideOpen} onOpenChange={setIosGuideOpen} appName={manifest.appName} isIos={isIos} />
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
              Acesso rápido na tela inicial do celular — funciona como um app nativo.
            </p>
            <Button type="button" className="mt-4 rounded-full gap-2" onClick={onClick}>
              <Download className="size-4" />
              {label}
            </Button>
          </div>
        </div>
      </div>
      <IosInstallDialog open={iosGuideOpen} onOpenChange={setIosGuideOpen} appName={manifest.appName} isIos={isIos} />
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Instalar {appName?.trim() || "o app"}</DialogTitle>
          <DialogDescription>
            {isIos
              ? "No iPhone, use o menu Compartilhar do Safari:"
              : "Se o botão de instalação não apareceu, use o menu do navegador:"}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Share className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Toque em <strong className="text-foreground">Compartilhar</strong> (ícone na barra inferior do Safari)</span>
          </li>
          <li className="flex items-start gap-2">
            <PlusSquare className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Escolha <strong className="text-foreground">Adicionar à Tela de Início</strong>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Confirme — o ícone aparecerá na home do celular</span>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
