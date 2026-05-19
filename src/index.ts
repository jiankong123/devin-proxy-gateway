import app from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { getDb, closeDb } from "./lib/db.js";
import { getEncryptionKey, decrypt } from "./lib/encryption.js";

// Fail-fast: refuse to start without a usable ENCRYPTION_KEY. We validate
// here (not lazily) so a missing/short key is reported once at boot rather
// than on the first request that tries to encrypt or decrypt.
try {
  getEncryptionKey();
} catch (err) {
  logger.fatal({ err }, "Cannot start: invalid ENCRYPTION_KEY");
  process.exit(1);
}

// Eagerly open the DB at startup so migrations (including the v0.1 → v0.2
// upstream-token re-encryption) run before we accept traffic.
const db = getDb();

// Sanity check: read one already-encrypted row and attempt to decrypt it.
// If this fails the operator likely set the wrong ENCRYPTION_KEY against an
// existing database — refuse to start rather than silently 500 every request.
try {
  const probe = db
    .prepare<[], { upstream_token: string }>(
      "SELECT upstream_token FROM proxy_keys WHERE upstream_token LIKE 'enc:v1:%' LIMIT 1",
    )
    .get();
  if (probe) decrypt(probe.upstream_token);
} catch (err) {
  logger.fatal(
    { err },
    "Cannot start: ENCRYPTION_KEY does not decrypt existing upstream_token rows. " +
      "Check that the key matches the one used to encrypt the database.",
  );
  process.exit(1);
}

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
