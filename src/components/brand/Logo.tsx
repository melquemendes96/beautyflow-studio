import logo from "@/assets/logo-jm.png";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Sombra mais suave em fundos claros (navbar, card mobile). */
  onLight?: boolean;
};

const floatShadowDark =
  "drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)] drop-shadow-[0_18px_36px_rgba(0,0,0,0.45)]";
const floatShadowLight =
  "drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)] drop-shadow-[0_10px_24px_rgba(0,0,0,0.18)]";

export function Logo({ className = "h-10", onLight = false }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center leading-none",
        onLight ? floatShadowLight : floatShadowDark,
      )}
    >
      <img
        src={logo}
        alt="JM BeautyFlow"
        decoding="async"
        className={cn("block w-auto max-w-full shrink-0 object-contain", className)}
        style={{ background: "transparent" }}
      />
    </span>
  );
}

export function WordMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-xl tracking-wide ${className}`}>
      <span className="text-foreground">JM</span>{" "}
      <span className="text-gold">BeautyFlow</span>
    </span>
  );
}
