/** Tiny formatting helpers shared by the table views. */

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatMs(n: number): string {
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

/** SQLite emits `YYYY-MM-DD HH:MM:SS` in UTC; show the operator local time. */
export function formatTimestamp(s: string | null): string {
  if (!s) return "—";
  // Convert SQLite-style `YYYY-MM-DD HH:MM:SS` to ISO so Date parses it
  // consistently across browsers.
  const iso = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

/** Map an HTTP status to a Tailwind color token for the badge. */
export function statusTone(status: number): "ok" | "warn" | "err" | "info" {
  if (status >= 500) return "err";
  if (status >= 400) return "warn";
  if (status >= 300) return "info";
  return "ok";
}
