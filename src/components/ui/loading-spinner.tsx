"use client";

import { cn } from "@/lib/utils";

type LoadingSpinnerProps = {
  className?: string;
};

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-primary",
        className,
      )}
    />
  );
}
