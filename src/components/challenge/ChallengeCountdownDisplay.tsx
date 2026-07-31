import { useEffect, useState } from "react";
import { getChallengeCountdown, pad2, type ChallengeCountdown } from "@/lib/challenge-60";

export function useChallengeCountdown(tickMs = 1000): ChallengeCountdown {
  const [state, setState] = useState(() => getChallengeCountdown());

  useEffect(() => {
    const id = window.setInterval(() => setState(getChallengeCountdown()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return state;
}

export function ChallengeCountdownDisplay({
  className = "",
  compact = false,
  variant = "default",
}: {
  className?: string;
  compact?: boolean;
  variant?: "default" | "lux";
}) {
  const c = useChallengeCountdown();

  if (c.ended) {
    return <span className={className}>Desafio encerrado</span>;
  }

  if (compact) {
    return (
      <span className={className}>
        {c.days}d {pad2(c.hours)}:{pad2(c.minutes)}:{pad2(c.seconds)}
      </span>
    );
  }

  const lux = variant === "lux";
  const units = [
    ["Dias", c.days, false],
    ["Horas", c.hours, true],
    ["Min", c.minutes, true],
    ["Seg", c.seconds, true],
  ] as const;

  return (
    <div className={`flex flex-wrap items-stretch justify-center gap-2 sm:gap-2.5 ${className}`}>
      {units.map(([label, value, pad]) => (
        <div
          key={label}
          className={
            lux
              ? "challenge-countdown-lux min-w-[4.25rem] flex-1 rounded-xl border border-[#c9a961]/25 bg-gradient-to-b from-white/[0.08] to-transparent px-2 py-2.5 text-center sm:min-w-[4.75rem]"
              : "min-w-[3.5rem] rounded-xl border border-foreground/10 bg-background/80 px-2 py-2 text-center shadow-soft"
          }
        >
          <div
            className={
              lux
                ? "font-display text-2xl font-semibold tabular-nums tracking-tight text-[#faf6ee] sm:text-[1.75rem]"
                : "font-display text-xl font-semibold tabular-nums sm:text-2xl"
            }
          >
            {pad ? pad2(value) : value}
          </div>
          <div
            className={
              lux
                ? "mt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#c9a961]/90"
                : "text-[10px] uppercase tracking-wider text-muted-foreground"
            }
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
