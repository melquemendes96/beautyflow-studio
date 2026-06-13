import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  endOfMonth,
  formatRangeLabel,
  startOfMonth,
  toYmd,
} from "@/lib/intelligent-calendar-range";
import { CalendarRange } from "lucide-react";

type Props = {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
};

function lastMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: toYmd(start), end: toYmd(end) };
}

function quarterBounds() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { start: toYmd(start), end: toYmd(end) };
}

function yearBounds() {
  const now = new Date();
  return {
    start: toYmd(new Date(now.getFullYear(), 0, 1)),
    end: toYmd(new Date(now.getFullYear(), 11, 31)),
  };
}

export function FinancialPeriodPicker({ start, end, onChange }: Props) {
  const now = new Date();
  const thisMonth = {
    start: toYmd(startOfMonth(now)),
    end: toYmd(endOfMonth(now)),
  };

  const presets = [
    { id: "month", label: "Este mês", ...thisMonth },
    { id: "last", label: "Mês anterior", ...lastMonthBounds() },
    { id: "quarter", label: "Trimestre", ...quarterBounds() },
    { id: "year", label: "Ano", ...yearBounds() },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = start === p.start && end === p.end;
          return (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={cn("rounded-full", !active && "bg-background/80")}
              onClick={() => onChange(p.start, p.end)}
            >
              {p.label}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background/70 px-3 py-2">
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
        <Input
          type="date"
          value={start}
          onChange={(e) => onChange(e.target.value, end)}
          className="h-9 w-[140px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => onChange(start, e.target.value)}
          className="h-9 w-[140px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {formatRangeLabel(start, end)}
        </span>
      </div>
    </div>
  );
}
