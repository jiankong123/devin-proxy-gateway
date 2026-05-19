import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}

/**
 * Capture the raw request body as a Buffer.
 *
 * MUST be mounted before any `express.json()` / `express.urlencoded()` —
 * once a body-parser consumes the stream there's nothing left for us to
 * forward upstream. GET / HEAD / OPTIONS skip body capture.
 */
export function rawBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
}
