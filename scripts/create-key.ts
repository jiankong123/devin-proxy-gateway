/**
 * CLI: create a new proxy key.
 *
 * Usage:
 *   pnpm run create-key <name> <upstream_token> [upstream_base_url] [notes]
 *
 * Example:
 *   pnpm run create-key "acme-corp" "cog_xxxxxxxxxx"
 *   pnpm run create-key "acme-enterprise" "cog_xxxxxxxxxx" "https://api.acme.devinenterprise.com"
 */

import { createKey } from "../src/lib/keys.js";
import { closeDb } from "../src/lib/db.js";

const [, , name, upstreamToken, upstreamBaseUrl, notes] = process.argv;

if (!name || !upstreamToken) {
  console.error(
    "Usage: pnpm run create-key <name> <upstream_token> [upstream_base_url] [notes]",
  );
  process.exit(1);
}

const result = createKey({
  name,
  upstreamToken,
  upstreamBaseUrl: upstreamBaseUrl ?? null,
  notes: notes ?? null,
});

console.log("Created proxy key:");
console.log("");
console.log(`  id:                 ${result.key.id}`);
console.log(`  name:               ${result.key.name}`);
console.log(`  key_prefix:         ${result.key.keyPrefix}...`);
console.log(`  upstream_base_url:  ${result.key.upstreamBaseUrl ?? "(default)"}`);
console.log(`  created_at:         ${result.key.createdAt}`);
console.log("");
console.log("Plaintext key (shown ONCE — copy it now):");
console.log("");
console.log(`  ${result.plaintext}`);
console.log("");

closeDb();
