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
