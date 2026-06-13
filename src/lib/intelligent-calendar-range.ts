import { useCallback, useMemo, useRef, useState } from "react";

export function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseYmd(ymd: string) {
  return new Date(`${ymd}T12:00:00`);
}

export function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function normalizeRange(start: string, end: string) {
  return start <= end ? { start, end } : { start: end, end: start };
}

export function formatRangeLabel(start: string, end: string) {
  if (start === end) {
    return parseYmd(start).toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  return `${parseYmd(start).toLocaleDateString("pt-BR")} – ${parseYmd(end).toLocaleDateString("pt-BR")}`;
}

export type DashboardRangeDay = {
  date: string;
  realized_revenue: number;
  realized_commission: number;
  realized_appointments: number;
  upcoming_revenue: number;
  upcoming_commission: number;
  upcoming_appointments: number;
  is_today: boolean;
  is_past: boolean;
  is_future: boolean;
};

export type DashboardRangeBlock = {
  revenue: number;
  commission: number;
  appointments: number;
  product_sales?: number;
  product_commission?: number;
};

export type DashboardRangeTodayBlock = {
  realized_revenue: number;
  realized_commission: number;
  realized_appointments: number;
  upcoming_revenue: number;
  upcoming_commission: number;
  upcoming_appointments: number;
};

export type DashboardRangeData = {
  ok: boolean;
  error?: string;
  start_date?: string;
  end_date?: string;
  today?: string;
  realized?: DashboardRangeBlock;
  today_block?: DashboardRangeTodayBlock;
  upcoming?: DashboardRangeBlock;
  days?: DashboardRangeDay[];
};

export function dayHasActivity(day: DashboardRangeDay) {
  return day.realized_appointments > 0 || day.upcoming_appointments > 0 || day.realized_revenue > 0 || day.upcoming_revenue > 0;
}

export function useIntelligentCalendarRange(initialKpi: string | null = "today") {
  const todayYmd = useMemo(() => toYmd(new Date()), []);
  const [rangeStart, setRangeStart] = useState(todayYmd);
  const [rangeEnd, setRangeEnd] = useState(todayYmd);
  const [activeKpi, setActiveKpi] = useState<string | null>(initialKpi);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const activeKpiRef = useRef<string | null>(initialKpi);
  activeKpiRef.current = activeKpi;

  const { start: queryStart, end: queryEnd } = useMemo(
    () => normalizeRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  const isSingleDay = queryStart === queryEnd;
  const isRange = !isSingleDay;

  const calendarSelected = useMemo(() => {
    const { start, end } = normalizeRange(rangeStart, rangeEnd);
    return { from: parseYmd(start), to: parseYmd(end) };
  }, [rangeStart, rangeEnd]);

  const applyPreset = useCallback((preset: "today" | "week" | "month") => {
    const now = new Date();
    setActiveKpi(preset);
    if (preset === "today") {
      const t = toYmd(now);
      setRangeStart(t);
      setRangeEnd(t);
    } else if (preset === "week") {
      setRangeStart(toYmd(startOfWeekMonday(now)));
      setRangeEnd(toYmd(endOfWeekSunday(now)));
    } else {
      setRangeStart(toYmd(startOfMonth(now)));
      setRangeEnd(toYmd(endOfMonth(now)));
    }
    setCalendarMonth(now);
  }, []);

  const handleDayClick = useCallback(
    (day: Date) => {
      const ymd = toYmd(day);
      const kpiWasActive = activeKpiRef.current !== null;
      setActiveKpi(null);

      const { start, end } = normalizeRange(rangeStart, rangeEnd);
      const isSingle = start === end;

      if (isSingle && start === ymd) return;

      if (isSingle && start !== ymd) {
        if (kpiWasActive) {
          setRangeStart(ymd);
          setRangeEnd(ymd);
          return;
        }
        setRangeEnd(ymd);
        return;
      }

      setRangeStart(ymd);
      setRangeEnd(ymd);
    },
    [rangeEnd, rangeStart],
  );

  return {
    todayYmd,
    rangeStart,
    rangeEnd,
    setRangeStart,
    setRangeEnd,
    activeKpi,
    setActiveKpi,
    calendarMonth,
    setCalendarMonth,
    queryStart,
    queryEnd,
    isSingleDay,
    isRange,
    calendarSelected,
    applyPreset,
    handleDayClick,
  };
}
