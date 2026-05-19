/**
 * Centralized environment configuration. Read once at startup.
 *
 * Each consumer imports `config` and never touches `process.env` directly,
 * which keeps test surface small and makes the defaults explicit.
 */

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0 || n > 65535) {
    throw new Error(`Invalid PORT value: "${raw}"`);
  }
  return n;
}

export interface Config {
  port: number;
  databasePath: string;
  adminApiKey: string;
  devinApiBaseUrl: string;
  logLevel: string;
  isProduction: boolean;
}

export const config: Config = {
  port: parsePort(process.env["PORT"], 8080),
  databasePath: process.env["DATABASE_PATH"] ?? "./data/gateway.db",
  adminApiKey: process.env["ADMIN_API_KEY"] ?? "",
  devinApiBaseUrl: stripTrailingSlash(
    process.env["DEVIN_API_BASE_URL"] ?? "https://api.devin.ai",
  ),
  logLevel: process.env["LOG_LEVEL"] ?? "info",
  isProduction: process.env["NODE_ENV"] === "production",
};
