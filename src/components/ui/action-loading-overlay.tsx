"use client";

import { LoadingSpinner } from "@/components/ui/loading-spinner";

type ActionLoadingOverlayProps = {
  open: boolean;
  title: string;
  description?: string;
};

export function ActionLoadingOverlay({
  open,
  title,
  description,
}: ActionLoadingOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/10 px-4 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/70 bg-white/92 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.16)] animate-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
          <LoadingSpinner className="h-9 w-9 border-slate-200 border-t-primary" />
        </div>
        <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {description || "Mohon tunggu sebentar. Proses sedang berjalan."}
        </p>
      </div>
    </div>
  );
}
