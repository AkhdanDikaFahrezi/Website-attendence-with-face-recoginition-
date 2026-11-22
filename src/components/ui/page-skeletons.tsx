"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PageHeroSkeleton() {
  return (
    <div className="app-hero space-y-4">
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <div className="flex flex-wrap gap-2 pt-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_36px_rgba(15,23,42,0.05)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-11 w-11 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionCardSkeleton({ height = "h-[320px]" }: { height?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className={`mt-6 w-full ${height}`} />
    </div>
  );
}

export function TableCardSkeleton({
  columns = 6,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="space-y-3">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={`head-${index}`} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="mt-6 space-y-4">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-16 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-9 w-28 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
