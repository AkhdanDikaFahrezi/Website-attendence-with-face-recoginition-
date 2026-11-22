import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-slate-200/90 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-24 w-full rounded-xl border bg-white px-3.5 py-3 text-base text-slate-900 shadow-none transition-[color,box-shadow,border-color] outline-none focus-visible:ring-[4px] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
