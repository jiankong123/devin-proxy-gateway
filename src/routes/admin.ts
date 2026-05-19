/**
 * Admin REST API for managing proxy keys.
 *
 * All routes require a static `ADMIN_API_KEY` via the adminAuth middleware.
 * Use this to script key provisioning from CI / Terraform / etc; for one-off
 * key creation prefer the `pnpm run create-key` CLI shipped under `scripts/`.
 */

import { Router, type Request, type Response } from "express";
import {
  createKey,
  deleteKey,
  getKey,
  listKeys,
  setKeyActive,
  type ProxyKey,
} from "../lib/keys.js";
import { queryUsage } from "../lib/usage.js";

const router: Router = Router();

interface CreateKeyBody {
  name?: unknown;
  upstream_token?: unknown;
  upstream_base_url?: unknown;
  notes?: unknown;
}

interface PatchKeyBody {
  is_active?: unknown;
}

// Public-facing key shape never includes the upstream token (would leak
// the customer's real Devin credentials to anyone with admin access logs).
function serialize(key: ProxyKey): Record<string, unknown> {
  return {
    id: key.id,
    name: key.name,
    key_prefix: key.keyPrefix,
    upstream_base_url: key.upstreamBaseUrl,
    is_active: key.isActive,
    created_at: key.createdAt,
    last_used_at: key.lastUsedAt,
    notes: key.notes,
  };
}

router.get("/keys", (_req: Request, res: Response) => {
  res.json({ keys: listKeys().map(serialize) });
});

router.post("/keys", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as CreateKeyBody;
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    res.status(400).json({
      error: { message: "`name` is required.", type: "validation_error", code: 400 },
    });
    return;
  }
  if (typeof body.upstream_token !== "string" || body.upstream_token.trim().length === 0) {
    res.status(400).json({
      error: { message: "`upstream_token` is required.", type: "validation_error", code: 400 },
    });
    return;
  }

  const result = createKey({
    name: body.name.trim(),
    upstreamToken: body.upstream_token.trim(),
    upstreamBaseUrl: typeof body.upstream_base_url === "string" ? body.upstream_base_url : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  });

  res.status(201).json({
    key: serialize(result.key),
    // The plaintext key is shown ONLY on creation. Operators must copy it
    // immediately — there is no way to recover it after this response.
    plaintext: result.plaintext,
  });
});

router.get("/keys/:id", (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      error: { message: "Invalid id.", type: "validation_error", code: 400 },
    });
    return;
  }
  const key = getKey(id);
  if (!key) {
    res.status(404).json({
      error: { message: "Key not found.", type: "not_found", code: 404 },
    });
    return;
  }
  res.json({ key: serialize(key) });
});

router.patch("/keys/:id", (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      error: { message: "Invalid id.", type: "validation_error", code: 400 },
    });
    return;
  }
  const body = (req.body ?? {}) as PatchKeyBody;
  if (typeof body.is_active !== "boolean") {
    res.status(400).json({
      error: {
        message: "`is_active` (boolean) is the only patchable field.",
        type: "validation_error",
        code: 400,
      },
    });
    return;
  }

  const changed = setKeyActive(id, body.is_active);
  if (!changed) {
    res.status(404).json({
      error: { message: "Key not found.", type: "not_found", code: 404 },
    });
    return;
  }
  const key = getKey(id);
  res.json({ key: key ? serialize(key) : null });
});

/**
 * GET /admin/usage
 *
 * Paginated read over `api_usage_logs` so operators (and, in v0.3, the
 * dashboard) can inspect recent traffic without going through `sqlite3`.
 *
 * Query parameters:
 *   - `limit`       int   default 50, max 200
 *   - `offset`      int   default 0
 *   - `client_key`  str   exact match (use `<missing>` / `<invalid>` to
 *                          inspect rejected-auth rows)
 *   - `status`      int   exact match (e.g. 401, 403, 200)
 *   - `since`       str   ISO timestamp lower bound on created_at
 *   - `until`       str   ISO timestamp upper bound on created_at
 *
 * Response: `{ items, total, limit, offset }` where `total` is the count
 * AFTER filters but BEFORE limit/offset, so the dashboard can paginate.
 */
router.get("/usage", (req: Request, res: Response) => {
  const q = req.query;

  const limitParsed = typeof q["limit"] === "string" ? Number(q["limit"]) : undefined;
  const offsetParsed = typeof q["offset"] === "string" ? Number(q["offset"]) : undefined;
  const statusParsed = typeof q["status"] === "string" ? Number(q["status"]) : undefined;

  if (limitParsed !== undefined && !Number.isFinite(limitParsed)) {
    res.status(400).json({
      error: { message: "`limit` must be an integer.", type: "validation_error", code: 400 },
    });
    return;
  }
  if (offsetParsed !== undefined && !Number.isFinite(offsetParsed)) {
    res.status(400).json({
      error: { message: "`offset` must be an integer.", type: "validation_error", code: 400 },
    });
    return;
  }
  if (statusParsed !== undefined && !Number.isInteger(statusParsed)) {
    res.status(400).json({
      error: { message: "`status` must be an integer.", type: "validation_error", code: 400 },
    });
    return;
  }

  const page = queryUsage({
    limit: limitParsed,
    offset: offsetParsed,
    clientKey: typeof q["client_key"] === "string" ? q["client_key"] : undefined,
    status: statusParsed,
    since: typeof q["since"] === "string" ? q["since"] : undefined,
    until: typeof q["until"] === "string" ? q["until"] : undefined,
  });

  // Surface `is_stream` as a real boolean — the underlying column is 0/1.
  res.json({
    items: page.items.map((row) => ({ ...row, is_stream: row.is_stream === 1 })),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  });
});

router.delete("/keys/:id", (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      error: { message: "Invalid id.", type: "validation_error", code: 400 },
    });
    return;
  }
  const ok = deleteKey(id);
  if (!ok) {
    res.status(404).json({
      error: { message: "Key not found.", type: "not_found", code: 404 },
    });
    return;
  }
  res.status(204).end();
});

export default router;
