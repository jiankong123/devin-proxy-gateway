/**
 * AES-256-GCM encryption helper for at-rest storage of upstream Devin tokens.
 *
 * Storage format (single TEXT column in SQLite):
 *
 *     enc:v1:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>
 *
 *  - `v1` is a stable version tag so we can rotate algorithms later
 *    (e.g. switch to AES-256-GCM-SIV or XChaCha20-Poly1305) without
 *    losing the ability to decrypt existing rows.
 *  - `iv` is 96 bits (12 bytes), the NIST-recommended size for GCM —
 *    we generate a fresh random one for every encryption.
 *  - `authTag` is the 128-bit (16-byte) GCM authentication tag.
 *  - `ciphertext` length equals plaintext length.
 *
 * Any value that does NOT start with the `enc:v1:` prefix is treated as
 * a legacy v0.1 plaintext token — `decrypt()` returns it as-is.  Callers
 * who want to migrate legacy rows should re-encrypt and persist; see
 * `migrateLegacyUpstreamTokens()` in `db.ts`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

export const ENC_PREFIX = "enc:v1:";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

/**
 * Decode `ENCRYPTION_KEY` from the environment.  Accepts hex (64 chars) or
 * base64 (with or without padding) — both must decode to exactly 32 bytes.
 *
 * Throws if the key is missing or malformed; this is intentional because
 * the proxy must refuse to start without a usable key.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = config.encryptionKey;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is required. Generate one with `openssl rand -hex 32` " +
        "and set it in your environment before starting the proxy.",
    );
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    // base64 / base64url — both work with Buffer.from(_, "base64")
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (256 bits); ` +
        `got ${key.length} bytes. Use \`openssl rand -hex 32\` to generate one.`,
    );
  }
  cachedKey = key;
  return key;
}

/** Reset the cached key.  Only intended for tests. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}

/** Returns true if the stored value is in our encrypted envelope format. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENC_PREFIX);
}

/** Encrypt a plaintext string into the storage envelope. */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENC_PREFIX.slice(0, -1), // "enc:v1" — re-add the colon below
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt a stored value.  Legacy plaintext (no `enc:v1:` prefix) is
 * returned unchanged so that v0.1 databases keep working until
 * `migrateLegacyUpstreamTokens()` has rewritten every row.
 */
export function decrypt(stored: string): string {
  if (!isEncrypted(stored)) {
    return stored;
  }
  const parts = stored.split(":");
  // Expect ["enc", "v1", <iv>, <tag>, <ct>]
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Malformed encrypted upstream_token payload");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[2]!, "base64url");
  const tag = Buffer.from(parts[3]!, "base64url");
  const ct = Buffer.from(parts[4]!, "base64url");
  if (iv.length !== IV_BYTES) {
    throw new Error(`Decryption failed: IV must be ${IV_BYTES} bytes, got ${iv.length}`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
