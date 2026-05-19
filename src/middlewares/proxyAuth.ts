import type { Request, Response, NextFunction } from "express";
import { lookupKey, touchKey, type ProxyKey } from "../lib/keys.js";
import { recordUsage } from "../lib/usage.js";

declare module "express-serve-static-core" {
  interface Request {
    proxyKey?: ProxyKey;
  }
}

function extractToken(req: Request): string {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function requestPathOf(req: Request): string {
  const qIdx = req.originalUrl.indexOf("?");
  const noQuery = qIdx === -1 ? req.originalUrl : req.originalUrl.slice(0, qIdx);
  return noQuery.startsWith("/") ? noQuery.slice(1) : noQuery;
}

interface RejectionLog {
  clientKey: string;
  status: number;
  errorMessage: string;
}

function logRejection(req: Request, startedAt: number, entry: RejectionLog): void {
  recordUsage({
    clientKey: entry.clientKey,
    method: req.method,
    requestPath: requestPathOf(req),
    status: entry.status,
    latencyMs: Date.now() - startedAt,
    isStream: false,
    requestBytes: null,
    responseBytes: null,
    errorMessage: entry.errorMessage,
  });
}

/**
 * Authenticate the caller using their `sk-devin-...` proxy key.
 * On success, attaches `req.proxyKey` for downstream handlers.
 *
 * All rejection paths (missing token, unknown key, disabled key) ALSO write
 * an `api_usage_logs` row so the table is a complete audit log — including
 * unauthenticated requests. We use a sentinel `client_key` for cases where
 * we cannot identify the caller (e.g. "<missing>", "<invalid>"). The logging
 * is bounded (each request creates exactly one row) so this cannot be abused
 * for unbounded log inflation beyond raw request volume.
 */
export function proxyAuth(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const token = extractToken(req);

  if (!token) {
    logRejection(req, startedAt, {
      clientKey: "<missing>",
      status: 401,
      errorMessage: "Missing Authorization Bearer token",
    });
    res.status(401).json({
      error: {
        message:
          "Missing API key. Provide via 'Authorization: Bearer sk-devin-...' header.",
        type: "auth_error",
        code: 401,
      },
    });
    return;
  }

  const key = lookupKey(token);
  if (!key) {
    logRejection(req, startedAt, {
      clientKey: "<invalid>",
      status: 403,
      errorMessage: "Unknown proxy key (no matching key_hash)",
    });
    res.status(403).json({
      error: { message: "Invalid API key.", type: "auth_error", code: 403 },
    });
    return;
  }

  if (!key.isActive) {
    logRejection(req, startedAt, {
      clientKey: key.name,
      status: 403,
      errorMessage: "Proxy key is disabled",
    });
    res.status(403).json({
      error: { message: "API key is disabled.", type: "auth_error", code: 403 },
    });
    return;
  }

  req.proxyKey = key;
  touchKey(key.id);
  next();
}
