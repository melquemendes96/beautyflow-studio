import { useMemo } from "react";
import {
  WEEKDAY_LABELS,
  buildTimeSelectOptions,
  formatPublicHoursText,
  normalizeTimeHm,
  toMinutes,
} from "@/lib/business-hours";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIME_OPTIONS = buildTimeSelectOptions(15);

function optionsWithCurrent(current: string): string[] {
  if (TIME_OPTIONS.includes(current)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, current].sort();
}

type Props = {
  workingDays: boolean[];
  openingTime: string;
  closingTime: string;
  onWorkingDaysChange: (days: boolean[]) => void;
  onOpeningTimeChange: (time: string) => void;
  onClosingTimeChange: (time: string) => void;
  /** Exibe o texto que vai para a página pública. */
  showPreview?: boolean;
  disabled?: boolean;
};

export function BusinessHoursPicker({
  workingDays,
  openingTime,
  closingTime,
  onWorkingDaysChange,
  onOpeningTimeChange,
  onClosingTimeChange,
  showPreview = true,
  disabled,
}: Props) {
  const open = normalizeTimeHm(openingTime);
  const close = normalizeTimeHm(closingTime, "19:00");
  const openOptions = useMemo(() => optionsWithCurrent(open), [open]);
  const closeOptions = useMemo(() => optionsWithCurrent(close), [close]);
  const invalidRange = toMinutes(close) <= toMinutes(open);
  const anyDay = workingDays.some(Boolean);

  const toggleDay = (index: number) => {
    if (disabled) return;
    const next = workingDays.slice();
    next[index] = !next[index];
    onWorkingDaysChange(next);
  };

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Dias de funcionamento</span>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, i) => {
            const on = Boolean(workingDays[i]);
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggleDay(i)}
                className={`min-w-11 rounded-full px-3 py-2 text-xs font-medium transition ${
                  on
                    ? "bg-foreground text-background"
                    : "border border-border bg-background text-muted-foreground hover:bg-secondary"
                } disabled:opacity-60`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {!anyDay ? (
          <p className="mt-1.5 text-[11px] text-destructive">Selecione ao menos um dia da semana.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Abre às</span>
          <Select value={open} onValueChange={onOpeningTimeChange} disabled={disabled}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Horário" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {openOptions.map((t) => (
                <SelectItem key={`open-${t}`} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Fecha às</span>
          <Select value={close} onValueChange={onClosingTimeChange} disabled={disabled}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Horário" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {closeOptions.map((t) => (
                <SelectItem key={`close-${t}`} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {invalidRange ? (
        <p className="text-[11px] text-destructive">O horário de fechamento deve ser depois da abertura.</p>
      ) : null}

      {showPreview && anyDay && !invalidRange ? (
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          Na página e na agenda:{" "}
          <span className="font-medium text-foreground">
            {formatPublicHoursText(workingDays, open, close)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
