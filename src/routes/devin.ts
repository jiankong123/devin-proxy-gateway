/**
 * Devin API bare-passthrough router.
 *
 * Mounted on:
 *   /v1/*  →  ${upstreamBase}/v1/*    (legacy Devin API)
 *   /v2/*  →  ${upstreamBase}/v2/*    (legacy enterprise API)
 *   /v3/*  →  ${upstreamBase}/v3/*    (current Devin API)
 *
 * Each request:
 *   1. Validates the caller's `sk-devin-...` proxy key (via proxyAuth).
 *   2. Strips the caller's Authorization header.
 *   3. Injects the proxy-key-specific upstream Devin token.
 *   4. Forwards the request verbatim to `api.devin.ai`, streaming the
 *      response back to the caller (so SSE long-running endpoints work).
 *   5. Records a usage log row.
 *
 * NB: Mounted BEFORE `express.json()` so the raw body — including
 * multipart/SSE payloads — passes through untouched.
 */

import { Router, type Request, type Response } from "express";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { proxyAuth } from "../middlewares/proxyAuth.js";
import { recordUsage } from "../lib/usage.js";

const router: Router = Router();

// Headers we strip before forwarding to the upstream. Includes the
// hop-by-hop set from RFC 7230 plus content-length (recalculated by fetch).
const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildUpstreamHeaders(req: Request, upstreamToken: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    // Client auth is replaced with the upstream Devin token below.
    if (lower === "authorization") continue;
    if (value === undefined) continue;
    headers[lower] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers["authorization"] = `Bearer ${upstreamToken}`;
  return headers;
}

async function forwardToDevin(
  req: Request,
  res: Response,
  apiVersion: "v1" | "v2" | "v3",
): Promise<void> {
  const key = req.proxyKey;
  if (!key) {
    // proxyAuth guarantees this; defensive check for TypeScript.
    res.status(500).json({
      error: { message: "Missing proxy key context.", type: "internal_error", code: 500 },
    });
    return;
  }

  const startTime = Date.now();
  const upstreamBase = stripTrailingSlash(key.upstreamBaseUrl ?? config.devinApiBaseUrl);

  // `req.path` here starts with /* (the sub-path after the mount point).
  // `req.originalUrl` contains the full URL including query string.
  const qIdx = req.originalUrl.indexOf("?");
  const queryString = qIdx === -1 ? "" : req.originalUrl.slice(qIdx);
  const subPath = req.path.startsWith("/") ? req.path : `/${req.path}`;
  const upstreamUrl = `${upstreamBase}/${apiVersion}${subPath}${queryString}`;

  const upstreamHeaders = buildUpstreamHeaders(req, key.upstreamToken);
  const rawBody = req.rawBody;
  const isStream = (req.headers["accept"] ?? "").toString().includes("text/event-stream");

  let status = 500;
  let responseBytes = 0;
  let errorMessage: string | null = null;

  try {
    if (rawBody && rawBody.length > 0) {
      upstreamHeaders["content-length"] = rawBody.length.toString();
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      // Buffer is a valid `BodyInit` at runtime (Node's undici accepts it),
      // but the lib types want a stricter union. The cast is intentional.
      body: rawBody && rawBody.length > 0 ? (rawBody as unknown as BodyInit) : undefined,
      // Node's undici fetch accepts `duplex` for half-duplex streaming.
      duplex: "half",
    } as RequestInit & { duplex?: "half" | "full" });

    status = upstreamRes.status;

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, k) => {
      // transfer-encoding is hop-by-hop and would conflict with content-length.
      if (k.toLowerCase() === "transfer-encoding") return;
      res.setHeader(k, value);
    });

    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseBytes += value.byteLength;
          res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (err) {
    status = 502;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.warn({ err, upstreamUrl }, "Devin upstream request failed");
    if (!res.headersSent) {
      res.status(502).json({
        error: { message: errorMessage, type: "upstream_error", code: 502 },
      });
    }
  } finally {
    recordUsage({
      clientKey: key.name,
      method: req.method,
      requestPath: `${apiVersion}${subPath}`,
      status,
      latencyMs: Date.now() - startTime,
      isStream,
      requestBytes: rawBody ? rawBody.length : null,
      responseBytes: responseBytes > 0 ? responseBytes : null,
      errorMessage,
    });
  }
}

// Use `router.use` (not `router.all` with a wildcard) to avoid
// path-to-regexp wildcard incompatibilities across Express 5.
router.use("/v1", proxyAuth, (req, res) => {
  void forwardToDevin(req, res, "v1");
});

router.use("/v2", proxyAuth, (req, res) => {
  void forwardToDevin(req, res, "v2");
});

router.use("/v3", proxyAuth, (req, res) => {
  void forwardToDevin(req, res, "v3");
});

export default router;
