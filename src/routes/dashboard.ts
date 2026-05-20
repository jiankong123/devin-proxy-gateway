/**
 * Static file mount for the operator console.
 *
 * The dashboard is a Vite-built React SPA that lives in
 * `<repo>/dashboard/dist/` after `pnpm --filter dashboard build` (or the
 * top-level `pnpm build`).  This module serves those static assets under
 * the `/dashboard` URL prefix and falls back to `index.html` for any
 * unknown sub-path so client-side routing (`wouter`) keeps working when
 * the operator deep-links or refreshes mid-page.
 *
 * In dev (`pnpm dev` for the gateway + `pnpm --filter dashboard dev` for
 * the UI), the UI is served directly by Vite on port 5173 and proxies
 * `/admin` / `/v*` back to this gateway — see `dashboard/vite.config.ts`.
 */

import { existsSync } from "node:fs";
import path from "node:path";
// Aliased to dodge a name collision with esbuild's bundling banner,
// which already injects `import { fileURLToPath } from "url"` at the top
// of `dist/index.mjs`.  Re-importing the same name from `"node:url"`
// produces a duplicate-identifier syntax error at runtime.
import { fileURLToPath as urlToPath } from "node:url";
import express, { type Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";

// `import.meta.url` is preserved by esbuild's bundling, so this resolves to
// `<repo>/dist/index.mjs` in production and `<repo>/src/routes/dashboard.ts`
// in dev (via `tsx`).  Either way, `../../dashboard/dist` from the source
// file's location and `../dashboard/dist` from the bundled entrypoint both
// land on the correct directory — we try a few candidates so the same code
// works in both modes.
const here = path.dirname(urlToPath(import.meta.url));
const candidates = [
  path.resolve(here, "../../dashboard/dist"), // src/routes/* (dev with tsx)
  path.resolve(here, "../dashboard/dist"),     // dist/index.mjs (production)
];
const dashboardDist = candidates.find((p) => existsSync(p)) ?? null;

export function dashboardRouter(): Router {
  const router = express.Router();

  if (dashboardDist === null) {
    logger.warn(
      { tried: candidates },
      "Dashboard bundle not found — /dashboard will return 503. " +
        "Build it with `pnpm --filter dashboard build` (or top-level `pnpm build`).",
    );
    router.use("/dashboard", (_req: Request, res: Response) => {
      res.status(503).json({
        error: {
          message:
            "Dashboard bundle is missing. Run `pnpm --filter dashboard build` to populate `dashboard/dist/`.",
          type: "dashboard_not_built",
          code: 503,
        },
      });
    });
    return router;
  }

  // Serve hashed assets with normal static semantics — Vite emits unique
  // file names per build so HTTP caching is safe.
  router.use(
    "/dashboard",
    express.static(dashboardDist, {
      index: false, // we handle index.html ourselves below
      maxAge: "1h",
      // Don't fall through to the SPA shell for asset 404s — that would
      // serve `index.html` as e.g. a missing `.css` request, which can
      // mask bugs and break browser caching.
      fallthrough: true,
    }),
  );

  // SPA fallback: any GET under `/dashboard/*` that didn't match a real
  // file gets `index.html`, so `wouter` can take over routing.  We
  // restrict this to GET so POSTs to typos don't silently 200.
  router.get(/^\/dashboard(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"));
  });

  return router;
}
