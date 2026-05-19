import type { Request, Response, NextFunction } from "express";
import { lookupKey, touchKey, type ProxyKey } from "../lib/keys.js";

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

/**
 * Authenticate the caller using their `sk-devin-...` proxy key.
 * On success, attaches `req.proxyKey` for downstream handlers.
 */
export function proxyAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
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
    res.status(403).json({
      error: { message: "Invalid API key.", type: "auth_error", code: 403 },
    });
    return;
  }

  if (!key.isActive) {
    res.status(403).json({
      error: { message: "API key is disabled.", type: "auth_error", code: 403 },
    });
    return;
  }

  req.proxyKey = key;
  touchKey(key.id);
  next();
}
