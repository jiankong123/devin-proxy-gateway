import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Plain-CSS modal (no Radix dep) — enough for our handful of dialogs.
 * Clicking the backdrop calls `onClose`; clicks inside the panel stop
 * propagation so they don't accidentally close it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#1e2d3d] bg-[#111827] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-[#1e2d3d] hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
