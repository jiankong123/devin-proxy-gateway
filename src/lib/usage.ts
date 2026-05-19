import { getDb } from "./db.js";
import { logger } from "./logger.js";

export interface UsageLog {
  clientKey: string;
  method: string;
  requestPath: string;
  status: number;
  latencyMs: number;
  isStream: boolean;
  requestBytes?: number | null;
  responseBytes?: number | null;
  errorMessage?: string | null;
}

export interface UsageLogRow {
  id: number;
  created_at: string;
  client_key: string;
  method: string;
  request_path: string;
  status: number;
  latency_ms: number;
  is_stream: number;
  request_bytes: number | null;
  response_bytes: number | null;
  error_message: string | null;
}

export interface UsageQuery {
  limit?: number;
  offset?: number;
  clientKey?: string;
  status?: number;
  /** ISO-8601 timestamp; matches rows with `created_at >= since`. */
  since?: string;
  /** ISO-8601 timestamp; matches rows with `created_at <= until`. */
  until?: string;
}

export interface UsagePage {
  items: UsageLogRow[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Insert a usage log row. Logging failures are caught and reported via pino —
 * a broken log write must never break the user's request.
 */
export function recordUsage(entry: UsageLog): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO api_usage_logs
         (client_key, method, request_path, status, latency_ms, is_stream, request_bytes, response_bytes, error_message)
         VALUES (@clientKey, @method, @requestPath, @status, @latencyMs, @isStream, @requestBytes, @responseBytes, @errorMessage)`,
      )
      .run({
        clientKey: entry.clientKey,
        method: entry.method,
        requestPath: entry.requestPath,
        status: entry.status,
        latencyMs: entry.latencyMs,
        isStream: entry.isStream ? 1 : 0,
        requestBytes: entry.requestBytes ?? null,
        responseBytes: entry.responseBytes ?? null,
        errorMessage: entry.errorMessage ?? null,
      });
  } catch (err) {
    logger.warn({ err }, "Failed to record usage log");
  }
}

/**
 * Paginated, filtered read over `api_usage_logs`. Used by the admin REST
 * API (and, in v0.3, the dashboard) to surface recent traffic.
 *
 * `total` reflects the row count AFTER filters but BEFORE limit/offset, so
 * callers can render "showing M of N matching" pagination.
 */
export function queryUsage(query: UsageQuery): UsagePage {
  const limit = Math.min(
    Math.max(1, Number.isFinite(query.limit) ? Math.floor(query.limit!) : DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const offset = Math.max(
    0,
    Number.isFinite(query.offset) ? Math.floor(query.offset!) : 0,
  );

  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (typeof query.clientKey === "string" && query.clientKey.length > 0) {
    where.push("client_key = @clientKey");
    params["clientKey"] = query.clientKey;
  }
  if (Number.isInteger(query.status)) {
    where.push("status = @status");
    params["status"] = query.status as number;
  }
  if (typeof query.since === "string" && query.since.length > 0) {
    where.push("created_at >= @since");
    params["since"] = query.since;
  }
  if (typeof query.until === "string" && query.until.length > 0) {
    where.push("created_at <= @until");
    params["until"] = query.until;
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const db = getDb();
  const total = db
    .prepare<typeof params, { count: number }>(
      `SELECT COUNT(*) AS count FROM api_usage_logs ${whereClause}`,
    )
    .get(params)?.count ?? 0;

  const items = db
    .prepare<Record<string, string | number>, UsageLogRow>(
      `SELECT id, created_at, client_key, method, request_path, status,
              latency_ms, is_stream, request_bytes, response_bytes, error_message
       FROM api_usage_logs
       ${whereClause}
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });

  return { items, total, limit, offset };
}
