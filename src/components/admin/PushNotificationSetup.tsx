import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useWebPush } from "@/hooks/useWebPush";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PushNotificationSetupProps = {
  companyId: string | null;
  hasCompany: boolean;
  profile?: "admin" | "staff" | "master";
  className?: string;
  compact?: boolean;
};

export function PushNotificationSetup({
  companyId,
  hasCompany,
  profile = "admin",
  className,
  compact = false,
}: PushNotificationSetupProps) {
  const { supported, permission, subscribed, pending, subscribe, unsubscribe } = useWebPush({
    companyId,
    enabled: hasCompany && Boolean(companyId),
    profile,
  });

  if (!hasCompany || !companyId) return null;

  if (!supported) {
    if (compact) return null;
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Notificações push: configure VITE_VAPID_PUBLIC_KEY e instale o app na tela inicial (iOS 16.4+).
      </p>
    );
  }

  if (permission === "denied") {
    if (compact) return null;
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Notificações bloqueadas no celular. Ative em Ajustes → Notificações → Safari ou do app instalado.
      </p>
    );
  }

  const onToggle = async () => {
    if (subscribed) {
      await unsubscribe();
      toast.message("Notificações push desativadas neste aparelho.");
      return;
    }
    const res = await subscribe();
    if (res.ok) {
      toast.success("Notificações ativadas", {
        description: "Você receberá alertas de agendamentos, pagamentos e cancelamentos.",
      });
    } else if (res.error === "denied") {
      toast.error("Permissão negada. Ative notificações nas configurações do aparelho.");
    } else {
      toast.error("Não foi possível ativar notificações push.");
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void onToggle()}
        disabled={pending}
        className={cn(
          "rounded-full border border-border p-2 transition hover:bg-accent",
          subscribed && "text-primary",
          className,
        )}
        title={subscribed ? "Notificações push ativas" : "Ativar notificações push"}
        aria-label={subscribed ? "Notificações push ativas" : "Ativar notificações push"}
      >
        {subscribed ? <Bell className="size-5" /> : <BellOff className="size-5 text-muted-foreground" />}
      </button>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-secondary/20 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Notificações no celular</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Alertas na barra do sistema para novos agendamentos, pagamentos e cancelamentos (iOS e Android).
          </p>
        </div>
        <Button
          type="button"
          variant={subscribed ? "outline" : "default"}
          size="sm"
          className="rounded-full shrink-0"
          disabled={pending}
          onClick={() => void onToggle()}
        >
          {subscribed ? "Desativar" : "Ativar notificações"}
        </Button>
      </div>
    </div>
  );
}
