/**
 * Build the production bundle with esbuild.
 *
 * - Bundles all TypeScript source into a single `dist/index.mjs` ESM file.
 * - Adds an ESM-CJS interop banner so `require()` and `__dirname` work in
 *   bundled dependencies that expect CommonJS semantics.
 * - Leaves `better-sqlite3` (native addon) external — must be installed
 *   alongside the bundle.
 * - Leaves `pino-pretty` external (only used in dev/debug; production uses
 *   raw JSON logs without a transport).
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
  external: ["better-sqlite3", "pino-pretty"],
  logLevel: "info",
});
