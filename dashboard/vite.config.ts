import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/**
 * Dashboard Vite config.
 *
 * The static bundle is served by the parent Express app at
 * `/dashboard/*` (see `src/routes/dashboard.ts`).  We set `base` so that
 * all asset URLs Vite emits (`/dashboard/assets/...`) line up with that
 * mount point.
 *
 * `outDir` is at the dashboard's own root so the parent build pipeline can
 * just point Express at `dashboard/dist/`.
 *
 * In dev mode the proxy at `/admin` and `/v*` forwards to the running
 * gateway so `pnpm dev` works without CORS.
 */
export default defineConfig({
  base: "/dashboard/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/admin": "http://127.0.0.1:8080",
      "/v1": "http://127.0.0.1:8080",
      "/v2": "http://127.0.0.1:8080",
      "/v3": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
    },
  },
});
