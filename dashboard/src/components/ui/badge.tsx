import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "err" | "info" | "neutral";

const tones: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  err: "bg-red-500/10 text-red-400 border-red-500/20",
  info: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  neutral: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
