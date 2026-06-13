import { Calendar as CalendarPicker, CalendarDayButton } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { type DashboardRangeDay, toYmd } from "@/lib/intelligent-calendar-range";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

type IntelligentCalendarPickerProps = {
  selected: DateRange;
  onSelectDay: (day: Date) => void;
  onMonthChange: (month: Date) => void;
  activityByDate: Map<string, DashboardRangeDay>;
  hint?: string;
};

export function IntelligentCalendarPicker({
  selected,
  onSelectDay,
  onMonthChange,
  activityByDate,
  hint,
}: IntelligentCalendarPickerProps) {
  return (
    <div className="w-fit rounded-2xl border border-border bg-card p-2 shadow-soft">
      <CalendarPicker
        mode="range"
        selected={selected}
        onSelect={(_range, day) => day && onSelectDay(day)}
        onMonthChange={onMonthChange}
        locale={ptBR}
        className="rounded-xl"
        components={{
          DayButton: (props) => {
            const ymd = toYmd(props.day.date);
            const info = activityByDate.get(ymd);
            const hasRealized =
              (info?.realized_appointments ?? 0) > 0 || (info?.realized_revenue ?? 0) > 0;
            const hasUpcoming =
              (info?.upcoming_appointments ?? 0) > 0 || (info?.upcoming_revenue ?? 0) > 0;
            return (
              <CalendarDayButton {...props} className={cn(props.className, "flex-col gap-0.5 leading-none")}>
                <span>{props.day.date.getDate()}</span>
                {(hasRealized || hasUpcoming) && (
                  <span className="flex gap-0.5">
                    {hasRealized ? <span className="size-1 rounded-full bg-success" /> : null}
                    {hasUpcoming ? <span className="size-1 rounded-full bg-info" /> : null}
                  </span>
                )}
              </CalendarDayButton>
            );
          },
        }}
      />
      {hint ? (
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : (
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted-foreground">
          Clique um dia para ver o detalhe. Clique outro dia para intervalo inteligente (passado · hoje · futuro).
        </p>
      )}
      <div className="flex flex-wrap gap-3 px-3 pb-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-success" /> Realizado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-info" /> Projetado
        </span>
      </div>
    </div>
  );
}
