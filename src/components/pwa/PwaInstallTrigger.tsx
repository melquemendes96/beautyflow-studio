import { useState } from "react";
import { Download, Smartphone, Share, PlusSquare, ChevronRight, ExternalLink, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePwaInstall, type ManualInstallGuide } from "@/hooks/usePwaInstall";
import type { PwaManifestOptions } from "@/lib/pwa-install";
import { getPwaInstallLabel, isIosDevice } from "@/lib/pwa-install";
import { IosInstallGuideVisual } from "@/components/pwa/IosInstallGuideVisual";
import { AndroidInstallGuideVisual } from "@/components/pwa/AndroidInstallGuideVisual";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  const { installed, install, manualGuide, setManualGuide, installing, canNativeInstall } =
    usePwaInstall(manifest);

  const onClick = () => {
    void install().then((res) => {
      if (res.ok && "native" in res && res.native) {
        toast.success("App instalado com sucesso!");
      }
    });
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

  const guideDialog = (
    <ManualInstallDialog
      open={manualGuide !== null}
      guide={manualGuide}
      onOpenChange={(open) => {
        if (!open) setManualGuide(null);
      }}
      appName={manifest.appName}
    />
  );

  const buttonLabel = installing
    ? "Preparando…"
    : !isIos && canNativeInstall
      ? "Instalar app"
      : installLabel;

  if (variant === "pill") {
    return (
      <>
        <button
          type="button"
          onClick={onClick}
          disabled={installing}
          className={cn(
            "public-booking-pill public-booking-pill--muted inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2.5 text-sm transition hover:opacity-90 disabled:opacity-60",
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
          <span className="font-medium">{buttonLabel}</span>
        </button>
        {guideDialog}
      </>
    );
  }

  if (variant === "button") {
    return (
      <>
        <Button
          type="button"
          onClick={onClick}
          disabled={installing}
          className={cn("rounded-full gap-2", className)}
        >
          {isIos ? <PlusSquare className="size-4" /> : <Download className="size-4" />}
          {buttonLabel}
        </Button>
        {guideDialog}
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
                : canNativeInstall
                  ? "Toque abaixo para instalar como app no Android (Chrome)."
                  : "Use o Chrome para instalar o app na tela inicial do celular."}
            </p>
            <Button
              type="button"
              className="mt-4 rounded-full gap-2"
              onClick={onClick}
              disabled={installing}
            >
              {isIos ? <PlusSquare className="size-4" /> : <Download className="size-4" />}
              {buttonLabel}
            </Button>
          </div>
        </div>
      </div>
      {guideDialog}
    </>
  );
}

function ManualInstallDialog({
  open,
  onOpenChange,
  guide,
  appName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  guide: ManualInstallGuide;
  appName?: string;
}) {
  const [iosStep, setIosStep] = useState<1 | 2 | 3>(1);

  const handleOpenChange = (v: boolean) => {
    if (!v) setIosStep(1);
    onOpenChange(v);
  };

  if (!guide) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {guide === "inapp"
              ? "Abra no Chrome"
              : guide === "ios"
                ? "Instalar na tela inicial"
                : "Instalar app no Android"}
            {appName?.trim() && guide !== "inapp" ? ` — ${appName.trim()}` : ""}
          </DialogTitle>
          <DialogDescription>
            {guide === "inapp" ? (
              <>
                Você está no navegador do <strong>Instagram / WhatsApp</strong>. Ele não instala apps. Copie o link e
                abra no <strong>Chrome</strong>.
              </>
            ) : guide === "ios" ? (
              "Use o Safari. Siga os 3 passos:"
            ) : (
              "O Chrome não exibiu o instalador automático. Use o menu do navegador:"
            )}
          </DialogDescription>
        </DialogHeader>

        {guide === "inapp" ? (
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>Toque nos <strong className="text-foreground">três pontinhos</strong> ou em Compartilhar</li>
              <li>Escolha <strong className="text-foreground">Abrir no Chrome</strong> ou copie o link</li>
              <li>No Chrome, toque em <strong className="text-foreground">Baixar app</strong> de novo</li>
            </ol>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full gap-2"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                toast.success("Link copiado. Cole no Chrome.");
              }}
            >
              <ExternalLink className="size-4" />
              Copiar link desta página
            </Button>
          </div>
        ) : null}

        {guide === "ios" ? (
          <>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIosStep(n)}
                  className={cn(
                    "flex-1 rounded-full py-1.5 text-xs font-medium transition",
                    iosStep === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  Passo {n}
                </button>
              ))}
            </div>
            <IosInstallGuideVisual appName={appName} step={iosStep} />
            {iosStep < 3 ? (
              <Button
                type="button"
                className="w-full rounded-full gap-2"
                onClick={() => setIosStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
              >
                Próximo passo
                <ChevronRight className="size-4" />
              </Button>
            ) : null}
          </>
        ) : null}

        {guide === "android" ? (
          <>
            <AndroidInstallGuideVisual appName={appName} />
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MoreVertical className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Toque no menu <strong className="text-foreground">⋮</strong> (canto superior direito do Chrome)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Download className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Escolha <strong className="text-foreground">Instalar app</strong> ou{" "}
                  <strong className="text-foreground">Adicionar à tela inicial</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Confirme — o ícone abrirá o agendamento do salão</span>
              </li>
            </ol>
            <p className="text-[11px] text-muted-foreground">
              Dica: use o <strong>Google Chrome</strong>, não o navegador do Instagram ou WhatsApp.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
