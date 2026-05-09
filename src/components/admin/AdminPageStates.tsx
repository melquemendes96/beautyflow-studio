import { Fragment, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AdminTableRowSkeleton({ cols = 3 }: { cols?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={cn("h-4 w-full", i === 0 && "max-w-[220px]")} />
        </td>
      ))}
    </tr>
  );
}

export function AdminKpiCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="size-4 rounded" />
      </div>
      <Skeleton className="mt-3 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-36" />
    </div>
  );
}

export function AdminServiceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-3/4 max-w-xs" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1 rounded-full" />
          <Skeleton className="h-9 flex-1 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AdminAgendaRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3">
      <Skeleton className="h-4 w-14 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-3 w-32 max-w-full" />
      </div>
      <Skeleton className="h-6 w-[4.5rem] shrink-0 rounded-full" />
    </div>
  );
}

/** Linha da visão “dia” da agenda (hora + slot). */
export function AdminAgendaDaySlotSkeleton() {
  return (
    <div className="flex gap-4 border-b border-border last:border-0 px-3 py-3">
      <Skeleton className="h-4 w-12 shrink-0 pt-1" />
      <Skeleton className="h-[4.5rem] flex-1 rounded-xl" />
    </div>
  );
}

export function AdminWaitlistCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-44 max-w-full" />
          <Skeleton className="h-3 w-60 max-w-full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-44 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AdminAgendaWeekGridSkeleton() {
  return (
    <div className="min-w-[700px] grid grid-cols-8 text-xs">
      <div />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="border-b border-l border-border p-3">
          <Skeleton className="mx-auto h-4 w-14" />
        </div>
      ))}
      {Array.from({ length: 7 }).map((_, ri) => (
        <Fragment key={ri}>
          <div className="border-b border-border p-3">
            <Skeleton className="h-3 w-10" />
          </div>
          {Array.from({ length: 7 }).map((_, ci) => (
            <div key={ci} className="border-b border-l border-border p-2">
              <Skeleton className="h-8 w-full rounded-md opacity-60" />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

export function AdminReportHeroCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <Skeleton className="h-3 w-36" />
      <Skeleton className="mt-2 h-10 w-32" />
      <Skeleton className="mt-2 h-3 w-44" />
    </div>
  );
}

export function AdminReportBarChartSkeleton() {
  return (
    <div className="flex h-56 items-end gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <Skeleton className="w-full rounded-t-xl" style={{ height: `${35 + (i % 4) * 12}%` }} />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

export function AdminReportServiceRowSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2">
        <Skeleton className="h-3 w-32 max-w-[55%]" />
        <Skeleton className="h-3 w-6 shrink-0" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

export function AdminBrandingFormSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  );
}

export function AdminBrandingPreviewSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elegant">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="space-y-3 p-6">
        <Skeleton className="size-20 rounded-2xl" />
        <Skeleton className="h-7 w-48 max-w-[80%]" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-sm" />
        <Skeleton className="mt-2 h-11 w-full rounded-full" />
      </div>
    </div>
  );
}

export function AdminConfigSectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <Skeleton className="mb-4 h-6 w-44" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

type AdminEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function AdminEmptyState({ icon: Icon, title, description, action }: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/15 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-foreground/[0.06]">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="mt-4 font-display text-lg text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
