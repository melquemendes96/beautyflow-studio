import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  /** Prefixo para aria-label (ex.: "Senha de login") */
  toggleLabel?: string;
};

/**
 * Campo de senha com alternância mostrar/ocultar (ícone olho).
 */
export function PasswordInput({ className, toggleLabel = "senha", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const showLabel = visible ? `Ocultar ${toggleLabel}` : `Mostrar ${toggleLabel}`;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        disabled={props.disabled}
        aria-label={showLabel}
        className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
