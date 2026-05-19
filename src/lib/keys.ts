import { getDb } from "./db.js";
import { generateProxyKey, hashKey } from "./crypto.js";

export interface ProxyKey {
  id: number;
  name: string;
  keyHash: string;
  keyPrefix: string;
  upstreamToken: string;
  upstreamBaseUrl: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  notes: string | null;
}

interface ProxyKeyRow {
  id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  upstream_token: string;
  upstream_base_url: string | null;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
  notes: string | null;
}

function rowToKey(row: ProxyKeyRow): ProxyKey {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    upstreamToken: row.upstream_token,
    upstreamBaseUrl: row.upstream_base_url,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    notes: row.notes,
  };
}

export interface CreateKeyInput {
  name: string;
  upstreamToken: string;
  upstreamBaseUrl?: string | null;
  notes?: string | null;
}

export interface CreatedKey {
  key: ProxyKey;
  /** Plaintext key — only available at creation time, never persisted. */
  plaintext: string;
}

/**
 * Create a new proxy key. Returns the plaintext key (for one-time display)
 * along with the persisted row. The plaintext key is NEVER stored — only its
 * SHA-256 hash and a short prefix for UI display.
 */
export function createKey(input: CreateKeyInput): CreatedKey {
  const db = getDb();
  const plaintext = generateProxyKey();
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, 16);

  const stmt = db.prepare(`
    INSERT INTO proxy_keys (name, key_hash, key_prefix, upstream_token, upstream_base_url, notes)
    VALUES (@name, @keyHash, @keyPrefix, @upstreamToken, @upstreamBaseUrl, @notes)
  `);
  const result = stmt.run({
    name: input.name,
    keyHash,
    keyPrefix,
    upstreamToken: input.upstreamToken,
    upstreamBaseUrl: input.upstreamBaseUrl ?? null,
    notes: input.notes ?? null,
  });

  const row = db
    .prepare<[number], ProxyKeyRow>("SELECT * FROM proxy_keys WHERE id = ?")
    .get(Number(result.lastInsertRowid));
  if (!row) throw new Error("Failed to read back inserted proxy key");

  return { key: rowToKey(row), plaintext };
}

/** Look up a proxy key by its plaintext value. Returns null if not found. */
export function lookupKey(plaintext: string): ProxyKey | null {
  const db = getDb();
  const hash = hashKey(plaintext);
  const row = db
    .prepare<[string], ProxyKeyRow>("SELECT * FROM proxy_keys WHERE key_hash = ?")
    .get(hash);
  return row ? rowToKey(row) : null;
}

/** Update the `last_used_at` timestamp. Best-effort — failures are swallowed. */
export function touchKey(id: number): void {
  try {
    getDb()
      .prepare("UPDATE proxy_keys SET last_used_at = datetime('now') WHERE id = ?")
      .run(id);
  } catch {
    // Swallow — touching is non-critical.
  }
}

export function listKeys(): ProxyKey[] {
  const rows = getDb()
    .prepare<[], ProxyKeyRow>("SELECT * FROM proxy_keys ORDER BY id DESC")
    .all();
  return rows.map(rowToKey);
}

export function getKey(id: number): ProxyKey | null {
  const row = getDb()
    .prepare<[number], ProxyKeyRow>("SELECT * FROM proxy_keys WHERE id = ?")
    .get(id);
  return row ? rowToKey(row) : null;
}

export function deleteKey(id: number): boolean {
  const result = getDb().prepare("DELETE FROM proxy_keys WHERE id = ?").run(id);
  return result.changes > 0;
}

export function setKeyActive(id: number, isActive: boolean): boolean {
  const result = getDb()
    .prepare("UPDATE proxy_keys SET is_active = ? WHERE id = ?")
    .run(isActive ? 1 : 0, id);
  return result.changes > 0;
}
