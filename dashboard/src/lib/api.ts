/**
 * Thin wrapper around `fetch` that injects the admin bearer token from
 * sessionStorage and surfaces server errors in a uniform shape.
 *
 * On 401 we clear the cached token and reload — the router will then
 * route the operator back to the login page.  Any non-2xx is thrown as
 * an `ApiError` carrying the parsed JSON body if there is one.
 */

import { clearAdminToken, getAdminToken } from "@/lib/auth";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface ServerErrorEnvelope {
  error?: { message?: string; type?: string; code?: number };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Treat 204 / empty bodies as `null`.
  let parsed: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearAdminToken();
      window.location.reload();
    }
    const envelope = parsed as ServerErrorEnvelope | null;
    const message =
      envelope?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}

// ── Proxy keys ──────────────────────────────────────────────────────────
export interface ProxyKey {
  id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  upstream_base_url: string | null;
  created_at: string;
  last_used_at: string | null;
  notes: string | null;
}

export interface CreatedKeyResponse {
  key: ProxyKey;
  /** Only returned at creation time — never retrievable again afterwards. */
  plaintext: string;
}

export const listKeys = () =>
  request<{ keys: ProxyKey[] }>("GET", "/admin/keys");

export const createKey = (input: {
  name: string;
  upstream_token: string;
  upstream_base_url?: string;
  notes?: string;
}) =>
  request<CreatedKeyResponse>("POST", "/admin/keys", input);

export const setKeyActive = (id: number, is_active: boolean) =>
  request<{ key: ProxyKey }>("PATCH", `/admin/keys/${id}`, { is_active });

// The server returns 204 No Content / empty body on delete, so we map
// success to `{ ok: true }` for the caller's convenience.
export const deleteKey = (id: number) =>
  request<unknown>("DELETE", `/admin/keys/${id}`).then(() => ({ ok: true as const }));

// ── Usage logs ──────────────────────────────────────────────────────────
export interface UsageLogRow {
  id: number;
  created_at: string;
  client_key: string;
  method: string;
  request_path: string;
  status: number;
  latency_ms: number;
  is_stream: boolean;
  request_bytes: number | null;
  response_bytes: number | null;
  error_message: string | null;
}

export interface UsagePage {
  items: UsageLogRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface UsageQuery {
  limit?: number;
  offset?: number;
  client_key?: string;
  status?: number;
  since?: string;
  until?: string;
}

export function queryUsage(q: UsageQuery): Promise<UsagePage> {
  const sp = new URLSearchParams();
  if (q.limit !== undefined) sp.set("limit", String(q.limit));
  if (q.offset !== undefined) sp.set("offset", String(q.offset));
  if (q.client_key) sp.set("client_key", q.client_key);
  if (q.status !== undefined) sp.set("status", String(q.status));
  if (q.since) sp.set("since", q.since);
  if (q.until) sp.set("until", q.until);
  const qs = sp.toString();
  return request<UsagePage>("GET", `/admin/usage${qs ? `?${qs}` : ""}`);
}

// ── Liveness ────────────────────────────────────────────────────────────
export const checkAdminAuth = () =>
  request<{ keys: ProxyKey[] }>("GET", "/admin/keys");
