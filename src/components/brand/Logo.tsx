import logo from "@/assets/logo-jm.png";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /**
   * Arte com fundo escuro: moldura charcoal em superfícies claras (ex.: card de login mobile).
   */
  onLight?: boolean;
};

export function Logo({ className = "h-10", onLight = false }: LogoProps) {
  const img = (
    <img
      src={logo}
      alt="BeautyFlow"
      decoding="async"
      className={cn("block w-auto max-w-full shrink-0 object-contain", className)}
      style={{ background: "transparent" }}
    />
  );

  if (onLight) {
    return (
      <span className="inline-flex items-center justify-center rounded-xl bg-[var(--charcoal)] px-3 py-2">
        {img}
      </span>
    );
  }

  return img;
}

export function WordMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-xl tracking-wide ${className}`}>
      <span className="text-foreground">JM</span>{" "}
      <span className="text-gold">BeautyFlow</span>
    </span>
  );
}
