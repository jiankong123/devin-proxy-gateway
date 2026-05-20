import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryUsage, type UsageQuery } from "@/lib/api";
import {
  formatBytes,
  formatMs,
  formatTimestamp,
  statusTone,
} from "@/lib/format";

const PAGE_SIZE = 50;

export function UsagePage() {
  const [draftClientKey, setDraftClientKey] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [applied, setApplied] = useState<{
    client_key?: string;
    status?: number;
  }>({});
  const [page, setPage] = useState(0);

  const filters: UsageQuery = useMemo(
    () => ({
      ...applied,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [applied, page],
  );

  const usage = useQuery({
    queryKey: ["usage", filters],
    queryFn: () => queryUsage(filters),
    placeholderData: (prev) => prev,
  });

  const total = usage.data?.total ?? 0;
  const items = usage.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applyFilters() {
    const f: { client_key?: string; status?: number } = {};
    if (draftClientKey.trim()) f.client_key = draftClientKey.trim();
    if (draftStatus.trim()) {
      const n = Number(draftStatus);
      if (Number.isInteger(n)) f.status = n;
    }
    setApplied(f);
    setPage(0);
  }

  function clearFilters() {
    setDraftClientKey("");
    setDraftStatus("");
    setApplied({});
    setPage(0);
  }

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ListChecks className="h-5 w-5 text-blue-400" />
            Usage Logs
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Every proxied request, plus auth rejections ({" "}
            <code className="font-mono text-slate-300">&lt;missing&gt;</code> /{" "}
            <code className="font-mono text-slate-300">&lt;invalid&gt;</code>),
            newest first.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => usage.refetch()}
          disabled={usage.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${usage.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-[#1e2d3d] bg-[#111827] p-4 sm:grid-cols-[2fr_1fr_auto]">
        <Input
          value={draftClientKey}
          onChange={(e) => setDraftClientKey(e.target.value)}
          placeholder="client_key (exact, e.g. team-a, <missing>, <invalid>)"
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
        <Input
          value={draftStatus}
          onChange={(e) => setDraftStatus(e.target.value)}
          placeholder="status (e.g. 200, 401, 403)"
          inputMode="numeric"
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
        <div className="flex gap-2">
          <Button onClick={applyFilters}>Apply</Button>
          <Button variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </div>

      {usage.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : usage.error ? (
        <ErrorPanel
          message={
            usage.error instanceof Error ? usage.error.message : "Failed to load"
          }
        />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#1e2d3d] p-8 text-center text-sm text-slate-500">
          No matching requests.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1e2d3d] bg-[#111827]">
          <table className="min-w-full divide-y divide-[#1e2d3d] text-left text-sm">
            <thead className="bg-[#0d1117]/60 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <Th>Time</Th>
                <Th>Client</Th>
                <Th>Method</Th>
                <Th>Path</Th>
                <Th>Status</Th>
                <Th className="text-right">Latency</Th>
                <Th className="text-right">Resp</Th>
                <Th>Stream</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d] text-slate-200">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-[#1e2d3d]/40">
                  <Td className="whitespace-nowrap text-slate-400">
                    {formatTimestamp(r.created_at)}
                  </Td>
                  <Td className="font-mono text-xs">
                    {r.client_key.startsWith("<") ? (
                      <span className="text-amber-400">{r.client_key}</span>
                    ) : (
                      r.client_key
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-slate-400">
                    {r.method}
                  </Td>
                  <Td className="font-mono text-xs">/{r.request_path}</Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <Td className="text-right text-slate-400">
                    {formatMs(r.latency_ms)}
                  </Td>
                  <Td className="text-right text-slate-400">
                    {formatBytes(r.response_bytes)}
                  </Td>
                  <Td>{r.is_stream ? <Badge tone="info">SSE</Badge> : null}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>
          {total > 0
            ? `Showing ${page * PAGE_SIZE + 1}–${Math.min(
                (page + 1) * PAGE_SIZE,
                total,
              )} of ${total}`
            : "—"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || usage.isFetching}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="font-mono">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= total || usage.isFetching}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-4 py-2.5 font-medium ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-2.5 align-middle ${className ?? ""}`}>{children}</td>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
      {message}
    </div>
  );
}
