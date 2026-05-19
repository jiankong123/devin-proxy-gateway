/**
 * Build the production bundle with esbuild.
 *
 * - Bundles all TypeScript source into a single `dist/index.mjs` ESM file.
 * - Adds an ESM-CJS interop banner so `require()` and `__dirname` work in
 *   bundled dependencies that expect CommonJS semantics.
 * - Leaves the following packages external (must remain installed alongside
 *   the bundle inside `node_modules/`):
 *     - `better-sqlite3` (native addon — cannot be bundled).
 *     - `pino` and `thread-stream` — both spawn worker threads via paths
 *       resolved relative to their installed location (e.g.
 *       `node_modules/pino/lib/worker.js`). Bundling rewrites those paths
 *       to `dist/lib/worker.js`, which does not exist and crashes the
 *       process the moment the logger enables a transport (e.g. the
 *       `pino-pretty` dev-mode pretty printer).
 *     - `pino-pretty` — itself a Pino transport, loaded by Pino's worker.
 */

import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.mjs",
  sourcemap: true,
  minify: false,
  banner: {
    js: [
      "import { createRequire } from 'module';",
      "import { fileURLToPath } from 'url';",
      "import { dirname } from 'path';",
      "const require = createRequire(import.meta.url);",
      "const __filename = fileURLToPath(import.meta.url);",
      "const __dirname = dirname(__filename);",
    ].join("\n"),
  },
  external: ["better-sqlite3", "pino", "pino-pretty", "thread-stream"],
  logLevel: "info",
});
