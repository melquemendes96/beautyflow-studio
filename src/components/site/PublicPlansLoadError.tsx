import { Button } from "@/components/ui/button";

const MESSAGE = "Não foi possível carregar os planos agora. Tente novamente.";

type Props = {
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
};

export function PublicPlansLoadError({ onRetry, isRetrying, className = "" }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-8 text-center ${className}`}
    >
      <p className="text-sm text-foreground">{MESSAGE}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-4 rounded-full"
        disabled={isRetrying}
        onClick={() => onRetry()}
      >
        {isRetrying ? "Carregando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}
