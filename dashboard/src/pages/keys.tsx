import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createKey,
  deleteKey,
  listKeys,
  setKeyActive,
  type CreatedKeyResponse,
  type ProxyKey,
} from "@/lib/api";
import { formatTimestamp } from "@/lib/format";

export function KeysPage() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["keys"], queryFn: listKeys });

  const [createOpen, setCreateOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedKeyResponse | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<ProxyKey | null>(null);

  const createMut = useMutation({
    mutationFn: createKey,
    onSuccess: (k) => {
      setJustCreated(k);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      setKeyActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteKey,
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  const rows = keys.data?.keys ?? [];

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <KeyRound className="h-5 w-5 text-blue-400" />
            Proxy Keys
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Each <code className="font-mono text-slate-300">sk-devin-…</code> key
            maps to one encrypted upstream Devin service-user token.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => keys.refetch()}
            disabled={keys.isFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${keys.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New key
          </Button>
        </div>
      </header>

      <KeysTable
        rows={rows}
        loading={keys.isLoading}
        error={keys.error instanceof Error ? keys.error.message : null}
        onToggle={(k) => toggleMut.mutate({ id: k.id, is_active: !k.is_active })}
        togglingId={toggleMut.isPending ? toggleMut.variables?.id : undefined}
        onDelete={(k) => setPendingDelete(k)}
      />

      <CreateKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        submitting={createMut.isPending}
        error={createMut.error instanceof Error ? createMut.error.message : null}
        onSubmit={(input) => createMut.mutate(input)}
      />

      <CreatedKeyDialog
        created={justCreated}
        onClose={() => setJustCreated(null)}
      />

      <DeleteKeyDialog
        target={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMut.mutate(pendingDelete.id)}
        submitting={deleteMut.isPending}
      />
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────
function KeysTable({
  rows,
  loading,
  error,
  onToggle,
  togglingId,
  onDelete,
}: {
  rows: ProxyKey[];
  loading: boolean;
  error: string | null;
  onToggle: (k: ProxyKey) => void;
  togglingId: number | undefined;
  onDelete: (k: ProxyKey) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error) {
    return <ErrorPanel message={error} />;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#1e2d3d] p-8 text-center text-sm text-slate-500">
        No proxy keys yet. Click <strong>New key</strong> to issue one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#1e2d3d] bg-[#111827]">
      <table className="min-w-full divide-y divide-[#1e2d3d] text-left text-sm">
        <thead className="bg-[#0d1117]/60 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <Th>ID</Th>
            <Th>Name</Th>
            <Th>Prefix</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th>Last used</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e2d3d] text-slate-200">
          {rows.map((k) => (
            <tr key={k.id} className="hover:bg-[#1e2d3d]/40">
              <Td className="font-mono text-slate-400">{k.id}</Td>
              <Td className="font-medium">{k.name}</Td>
              <Td className="font-mono text-slate-400">
                {k.key_prefix}…
              </Td>
              <Td>
                {k.is_active ? (
                  <Badge tone="ok">active</Badge>
                ) : (
                  <Badge tone="neutral">disabled</Badge>
                )}
              </Td>
              <Td className="text-slate-400">{formatTimestamp(k.created_at)}</Td>
              <Td className="text-slate-400">
                {formatTimestamp(k.last_used_at)}
              </Td>
              <Td className="text-right">
                <div className="inline-flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onToggle(k)}
                    disabled={togglingId === k.id}
                  >
                    <Power className="h-3 w-3" />
                    {k.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onDelete(k)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cell helpers ──────────────────────────────────────────────────────────
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 font-medium ${className ?? ""}`}>{children}</th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-2.5 align-middle ${className ?? ""}`}>{children}</td>
  );
}

// ── Create dialog ────────────────────────────────────────────────────────
function CreateKeyDialog({
  open,
  onClose,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: { name: string; upstream_token: string; upstream_base_url?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [upstreamToken, setUpstreamToken] = useState("");
  const [upstreamBaseUrl, setUpstreamBaseUrl] = useState("");

  function handleClose() {
    setName("");
    setUpstreamToken("");
    setUpstreamBaseUrl("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Create proxy key">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !upstreamToken.trim()) return;
          onSubmit({
            name: name.trim(),
            upstream_token: upstreamToken.trim(),
            ...(upstreamBaseUrl.trim()
              ? { upstream_base_url: upstreamBaseUrl.trim() }
              : {}),
          });
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. team-frontend"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Upstream Devin token</Label>
          <Input
            value={upstreamToken}
            onChange={(e) => setUpstreamToken(e.target.value)}
            placeholder="cog_…"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-[11px] text-slate-500">
            Stored encrypted (AES-256-GCM) — never displayed again.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Upstream base URL (optional)</Label>
          <Input
            value={upstreamBaseUrl}
            onChange={(e) => setUpstreamBaseUrl(e.target.value)}
            placeholder="https://api.devin.ai"
            className="font-mono"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              submitting || !name.trim() || !upstreamToken.trim()
            }
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-400">{children}</label>
  );
}

// ── Just-created dialog ──────────────────────────────────────────────────
function CreatedKeyDialog({
  created,
  onClose,
}: {
  created: CreatedKeyResponse | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open={created !== null}
      onClose={onClose}
      title="Proxy key created"
    >
      {created && (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            This is the only time the full key is shown. Copy it now —
            the gateway only stores a hash.
          </div>

          <div className="space-y-1.5">
            <Label>Plaintext key</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-[#1e2d3d] bg-[#0d1117] px-3 py-2 font-mono text-xs text-slate-100 break-all">
                {created.plaintext}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(created.plaintext);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── Delete confirmation ──────────────────────────────────────────────────
function DeleteKeyDialog({
  target,
  onCancel,
  onConfirm,
  submitting,
}: {
  target: ProxyKey | null;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={target !== null} onClose={onCancel} title="Delete proxy key">
      {target && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Permanently delete <strong className="font-medium">{target.name}</strong>
            ? Clients holding{" "}
            <code className="font-mono text-slate-400">{target.key_prefix}…</code>{" "}
            will start receiving HTTP 401. This cannot be undone.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" /> Delete permanently
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
      {message}
    </div>
  );
}
