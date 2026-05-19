import type { Request, Response, NextFunction } from "express";
import { config } from "../lib/config.js";
import { timingSafeEqual } from "../lib/crypto.js";

/**
 * Guard the /admin/* routes with a single static admin key.
 *
 * If `ADMIN_API_KEY` is empty, /admin/* is disabled entirely (401 for every
 * request) — operators must opt in by setting a strong admin key.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminApiKey) {
    res.status(401).json({
      error: {
        message: "Admin API is disabled. Set ADMIN_API_KEY to enable it.",
        type: "admin_disabled",
        code: 401,
      },
    });
    return;
  }

  const auth = req.headers["authorization"];
  const token =
    typeof auth === "string" && auth.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : "";

  if (!token || !timingSafeEqual(token, config.adminApiKey)) {
    res.status(403).json({
      error: { message: "Invalid admin token.", type: "auth_error", code: 403 },
    });
    return;
  }

  next();
}
