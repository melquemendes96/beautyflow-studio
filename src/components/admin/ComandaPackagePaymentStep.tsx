import { Check, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PackageResolution = "confirm" | "avulso";

type Props = {
  value: PackageResolution | null;
  onChange: (value: PackageResolution) => void;
  disabled?: boolean;
};

export function ComandaPackagePaymentStep({ value, onChange, disabled }: Props) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
      <h4 className="text-sm font-semibold text-warning">Pacote aguardando pagamento no salão</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        {value === "avulso"
          ? "A cliente pagou só um atendimento avulso — selecione abaixo qual serviço ela recebeu. O pacote será cancelado."
          : "A cliente pagou o pacote completo — confirme e feche a comanda com o valor do pacote."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={value === "confirm" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange("confirm")}
        >
          <Check className="size-3.5" />
          Confirmar pacote
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === "avulso" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange("avulso")}
        >
          <Scissors className="size-3.5" />
          Só avulso
        </Button>
      </div>
      {!value ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Selecione uma opção para habilitar o fechamento.</p>
      ) : null}
    </div>
  );
}
