/**
 * CLI: list all proxy keys (does not reveal plaintext or upstream tokens).
 *
 * Usage:
 *   pnpm run list-keys
 */

import { listKeys } from "../src/lib/keys.js";
import { closeDb } from "../src/lib/db.js";

const rows = listKeys();

if (rows.length === 0) {
  console.log("(no proxy keys)");
} else {
  const fmt = (s: string | null, w: number) => (s ?? "").padEnd(w);
  console.log(
    `${fmt("ID", 4)}${fmt("NAME", 30)}${fmt("PREFIX", 20)}${fmt("ACTIVE", 8)}${fmt("LAST USED", 22)}`,
  );
  for (const k of rows) {
    console.log(
      `${fmt(String(k.id), 4)}${fmt(k.name, 30)}${fmt(`${k.keyPrefix}...`, 20)}${fmt(
        k.isActive ? "yes" : "no",
        8,
      )}${fmt(k.lastUsedAt, 22)}`,
    );
  }
}

closeDb();
