import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { rawBody } from "./middlewares/rawBody.js";
import { adminAuth } from "./middlewares/adminAuth.js";
import healthRouter from "./routes/health.js";
import adminRouter from "./routes/admin.js";
import devinRouter from "./routes/devin.js";

const app: Express = express();

app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());

// Normalize "//path" → "/path" — clients that configure base URL with a
// trailing slash (e.g. `https://host/v1/`) otherwise produce double-slashed
// paths that some edge proxies redirect with a 301 (which POST clients
// don't follow), causing confusing failures.
app.use((req, _res, next) => {
  if (req.url.includes("//")) {
    const [path, query] = req.url.split("?");
    req.url = (path ?? "/").replace(/\/{2,}/g, "/") + (query ? `?${query}` : "");
  }
  next();
});

// Health is the only route that does NOT need a body parser and does NOT
// need raw body. Mount it first so liveness probes are unaffected by
// anything else.
app.use(healthRouter);

// ── Admin routes (JSON in, JSON out) ─────────────────────────────────────
// Mounted BEFORE the devin passthrough so the global rawBody middleware
// does NOT consume the admin request stream. Auth is applied first so we
// don't even parse bodies for unauthenticated callers.
app.use("/admin", adminAuth, express.json({ limit: "1mb" }), adminRouter);

// ── Devin bare-passthrough router ─────────────────────────────────────────
// Captures the raw body (including multipart file uploads and SSE payloads)
// and forwards verbatim to api.devin.ai. Mounted AFTER /admin and the
// catch-all-friendly /health so it doesn't intercept those.
app.use(rawBody, devinRouter);

// Catch-all to give callers a useful hint when they hit the wrong path.
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint '${req.method} ${req.path}' not found. Use base URL '<host>' with paths like /v1/sessions, /v3/organizations/{org_id}/sessions, or /admin/keys.`,
      type: "endpoint_not_found",
      code: 404,
    },
  });
});

export default app;
