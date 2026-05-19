import app from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { getDb, closeDb } from "./lib/db.js";

// Eagerly open the DB at startup so migrations run before we accept traffic.
getDb();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.isProduction ? "production" : "development" },
    "Devin proxy gateway listening",
  );
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down");
  server.close((err) => {
    if (err) logger.error({ err }, "Error closing HTTP server");
    closeDb();
    process.exit(err ? 1 : 0);
  });
  // Force-exit after 10s if the close hangs (e.g. open SSE streams).
  setTimeout(() => {
    logger.warn("Force-exiting after 10s shutdown grace period");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
