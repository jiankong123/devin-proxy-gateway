import crypto from "node:crypto";

/** SHA-256 hex digest. Used to store proxy keys without keeping plaintext. */
export function hashKey(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/**
 * Generate a fresh proxy key in the form `sk-devin-<48 hex chars>`.
 * 48 hex chars = 192 bits of entropy, comfortably above any practical
 * collision/brute-force concern.
 */
export function generateProxyKey(): string {
  const random = crypto.randomBytes(24).toString("hex");
  return `sk-devin-${random}`;
}

/**
 * Constant-time string comparison. Use for comparing the admin API key
 * supplied via HTTP header against the one in env, to avoid leaking
 * length/byte information via timing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
