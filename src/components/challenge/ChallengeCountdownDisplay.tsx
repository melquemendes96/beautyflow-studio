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
}: {
  className?: string;
  compact?: boolean;
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

  return (
    <div className={`flex flex-wrap items-stretch justify-center gap-2 ${className}`}>
      {(
        [
          ["Dias", c.days],
          ["Horas", c.hours],
          ["Min", c.minutes],
          ["Seg", c.seconds],
        ] as const
      ).map(([label, value]) => (
        <div
          key={label}
          className="min-w-[3.5rem] rounded-xl border border-foreground/10 bg-background/80 px-2 py-2 text-center shadow-soft"
        >
          <div className="font-display text-xl font-semibold tabular-nums sm:text-2xl">
            {label === "Dias" ? value : pad2(value)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}
