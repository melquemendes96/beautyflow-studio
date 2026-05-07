import logo from "@/assets/logo-jm.png";

export function Logo({ className = "h-10" }: { className?: string }) {
  return <img src={logo} alt="JM BeautyFlow" className={`${className} w-auto object-contain`} />;
}

export function WordMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-xl tracking-wide ${className}`}>
      <span className="text-foreground">JM</span>{" "}
      <span className="text-gold">BeautyFlow</span>
    </span>
  );
}
