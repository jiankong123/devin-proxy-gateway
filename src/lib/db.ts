import Database, { type Database as DatabaseType } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { encrypt, isEncrypted } from "./encryption.js";

let dbInstance: DatabaseType | null = null;

/** Lazily open (and migrate) the SQLite database. Safe to call repeatedly. */
export function getDb(): DatabaseType {
  if (dbInstance) return dbInstance;

  const dir = path.dirname(config.databasePath);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  migrateLegacyUpstreamTokens(db);

  dbInstance = db;
  logger.info({ path: config.databasePath }, "SQLite database ready");
  return db;
}

/**
 * One-time migration: re-encrypt any `upstream_token` rows that were stored
 * as plaintext under v0.1. Runs on every startup but is idempotent — once
 * every row has the `enc:v1:` prefix the query finds nothing to do.
 *
 * We deliberately use a single `BEGIN` so a crash mid-migration leaves the
 * table consistent (either every selected row is encrypted, or none is).
 */
function migrateLegacyUpstreamTokens(db: DatabaseType): void {
  const rows = db
    .prepare<[], { id: number; upstream_token: string }>(
      "SELECT id, upstream_token FROM proxy_keys",
    )
    .all()
    .filter((r) => !isEncrypted(r.upstream_token));

  if (rows.length === 0) return;

  const update = db.prepare(
    "UPDATE proxy_keys SET upstream_token = ? WHERE id = ?",
  );
  const tx = db.transaction((batch: typeof rows) => {
    for (const r of batch) {
      update.run(encrypt(r.upstream_token), r.id);
    }
  });
  tx(rows);
  logger.warn(
    { migrated: rows.length },
    "Re-encrypted legacy plaintext upstream_token rows from v0.1",
  );
}

function migrate(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS proxy_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      upstream_token TEXT NOT NULL,
      upstream_base_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_proxy_keys_hash ON proxy_keys(key_hash);

    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      client_key TEXT NOT NULL,
      method TEXT NOT NULL,
      request_path TEXT NOT NULL,
      status INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      is_stream INTEGER NOT NULL DEFAULT 0,
      request_bytes INTEGER,
      response_bytes INTEGER,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON api_usage_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_client_key ON api_usage_logs(client_key);
  `);
}

/** Close the DB. Mainly used by tests / graceful-shutdown handlers. */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
