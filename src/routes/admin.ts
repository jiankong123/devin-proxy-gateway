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
