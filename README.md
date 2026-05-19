# Devin Proxy Gateway

> Multi-tenant reverse proxy for the [Devin API](https://docs.devin.ai/api-reference/overview). Issue `sk-devin-*` proxy keys to your customers; the gateway swaps each one for the customer's real Devin service-user token before forwarding to `api.devin.ai`. Inspired by [`jiankong123/ai-proxy-gateway`](https://github.com/jiankong123/ai-proxy-gateway).

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Node%2020%20%2B%20Express%205-blue.svg)](https://expressjs.com/)
[![Storage](https://img.shields.io/badge/storage-SQLite-orange.svg)](https://www.sqlite.org/)

## Why

Devin's API uses `Bearer` token auth on every endpoint (`apk_user_*` for legacy v1/v2, `cog_*` service-user tokens for v3). When you want to expose Devin to multiple downstream consumers without giving them your real token directly, you need a reverse proxy that:

- Issues per-consumer proxy keys (e.g. `sk-devin-xxx`).
- Maps each proxy key to that consumer's own Devin token.
- Strips the consumer's `Authorization` header and injects the real token before forwarding.
- Logs every request for billing / auditing.
- Doesn't touch the request/response bodies — Devin's API is REST + SSE, not chat-completions, so it must be a **bare passthrough** to support session creation, message streaming, attachment uploads, etc.

## Features

- **Bare-passthrough proxy** for `/v1/*`, `/v2/*`, `/v3/*` → `api.devin.ai/{v1,v2,v3}/*`. Raw body forwarded verbatim, response streamed back chunk-by-chunk (SSE-safe).
- **Multi-tenant proxy keys**: each `sk-devin-*` key is associated with its own upstream Devin token and (optionally) an enterprise base URL override.
- **Admin REST API** at `/admin/keys` for programmatic key management, protected by a single `ADMIN_API_KEY` env var.
- **CLI helpers**: `pnpm run create-key`, `pnpm run list-keys`.
- **Per-request usage log** in SQLite — client name, method, path, status, latency, byte counts.
- **Zero deployment friction**: SQLite, single binary build (esbuild), no external services needed.

## Architecture

```
┌────────────────┐   Authorization: Bearer sk-devin-xxx
│  Your client   │ ───────────────────────────────────┐
└────────────────┘                                    │
                                                      ↓
                        ┌────────────────────────────────────────────┐
                        │      Devin Proxy Gateway (this repo)        │
                        │  • proxyAuth: lookup sk-devin-* → ProxyKey  │
                        │  • strip client Authorization               │
                        │  • inject Bearer ${upstream_token}          │
                        │  • streaming fetch passthrough              │
                        │  • write api_usage_logs                     │
                        └────────────────────┬───────────────────────┘
                                             ↓
                                  https://api.devin.ai/{v1,v2,v3}/*
```

## Routes

| Path                          | Description                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /health`                 | Liveness probe. No auth.                                                                          |
| `* /v1/*`                     | Legacy Devin v1 API passthrough.                                                                  |
| `* /v2/*`                     | Legacy Devin v2 enterprise API passthrough.                                                       |
| `* /v3/*`                     | Current Devin v3 API passthrough (sessions, secrets, knowledge, etc.).                            |
| `GET /admin/keys`             | List proxy keys (never reveals plaintext or upstream tokens). Requires `ADMIN_API_KEY`.           |
| `POST /admin/keys`            | Create a proxy key. **Plaintext is returned ONCE — copy it now.** Requires `ADMIN_API_KEY`.       |
| `GET /admin/keys/:id`         | Get a single key by id. Requires `ADMIN_API_KEY`.                                                 |
| `PATCH /admin/keys/:id`       | Toggle `is_active`. Requires `ADMIN_API_KEY`.                                                     |
| `DELETE /admin/keys/:id`      | Permanently delete a key. Requires `ADMIN_API_KEY`.                                               |

> All `/v1/*`, `/v2/*`, `/v3/*` requests require `Authorization: Bearer sk-devin-...`. All `/admin/*` requests require `Authorization: Bearer ${ADMIN_API_KEY}`.

## Quick start

```bash
git clone https://github.com/jiankong123/devin-proxy-gateway.git
cd devin-proxy-gateway
pnpm install

# Configure env
cp .env.example .env
# edit .env — at minimum set ADMIN_API_KEY to a long random string

# Provision a proxy key for your first customer:
pnpm run create-key "acme-corp" "cog_REAL_DEVIN_SERVICE_USER_TOKEN_HERE"

# Run the gateway
pnpm run dev          # development (tsx watch)
# or
pnpm run build && pnpm run start    # production
```

## Usage

### Create a proxy key

Via CLI:

```bash
pnpm run create-key "acme-corp" "cog_xxxxxxxxxxxxxxxxxx"
# →  sk-devin-abc123def456...
```

Or via the admin REST API:

```bash
curl https://your-gateway.example.com/admin/keys \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "acme-corp",
    "upstream_token": "cog_xxxxxxxxxxxxxxxxxx",
    "upstream_base_url": "https://api.acme-corp.devinenterprise.com",
    "notes": "Acme Corp prod key"
  }'
```

Response (key shown ONCE):

```json
{
  "key": {
    "id": 1,
    "name": "acme-corp",
    "key_prefix": "sk-devin-abc123d",
    "upstream_base_url": "https://api.acme-corp.devinenterprise.com",
    "is_active": true,
    "created_at": "2026-01-15 14:23:01",
    "last_used_at": null,
    "notes": "Acme Corp prod key"
  },
  "plaintext": "sk-devin-abc123def456..."
}
```

### Call Devin via the proxy

Hand the customer the plaintext `sk-devin-*` key and your gateway's base URL.

Create a session (v1, legacy):

```bash
curl https://your-gateway.example.com/v1/sessions \
  -H "Authorization: Bearer sk-devin-abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{"prompt": "fix the failing test in src/login.test.ts"}'
```

List sessions (v3, current):

```bash
curl https://your-gateway.example.com/v3/organizations/$ORG_ID/sessions \
  -H "Authorization: Bearer sk-devin-abc123def456..."
```

Send a message and stream SSE responses (the proxy is fully streaming-aware):

```bash
curl https://your-gateway.example.com/v3/organizations/$ORG_ID/sessions/$SESSION_ID/messages \
  -H "Authorization: Bearer sk-devin-abc123def456..." \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"message": "what's the status?"}'
```

The gateway adds **no transformation**: the request body, headers (except `Authorization`), and query string go upstream untouched, and the upstream's status code, response headers, and streaming body come back untouched.

## Environment variables

| Variable             | Default                  | Description                                                                                |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `PORT`               | `8080`                   | TCP port the gateway listens on.                                                           |
| `DATABASE_PATH`      | `./data/gateway.db`      | SQLite database file. Created automatically; parent dir is `mkdir -p`'d.                   |
| `ADMIN_API_KEY`      | *(disabled)*             | Static bearer token for `/admin/*`. If empty, the admin API returns 401 for every request. |
| `DEVIN_API_BASE_URL` | `https://api.devin.ai`   | Default upstream. Override per-key with `upstream_base_url` for enterprise deployments.    |
| `LOG_LEVEL`          | `info`                   | `trace` / `debug` / `info` / `warn` / `error` / `fatal`.                                   |
| `NODE_ENV`           | `development`            | `production` switches the logger to JSON output (no `pino-pretty`).                        |

## Database schema

SQLite, two tables:

```sql
CREATE TABLE proxy_keys (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,                 -- human-readable client name
  key_hash          TEXT NOT NULL UNIQUE,           -- sha256(plaintext)
  key_prefix        TEXT NOT NULL,                  -- first 16 chars for UI display
  upstream_token    TEXT NOT NULL,                  -- AES-256-GCM-encrypted Devin token, prefix `enc:v1:`
  upstream_base_url TEXT,                           -- nullable; overrides DEVIN_API_BASE_URL
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at      TEXT,
  notes             TEXT
);

CREATE TABLE api_usage_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  client_key      TEXT NOT NULL,                    -- proxy_keys.name
  method          TEXT NOT NULL,                    -- HTTP method
  request_path    TEXT NOT NULL,                    -- e.g. "v3/organizations/.../sessions"
  status          INTEGER NOT NULL,                 -- upstream HTTP status
  latency_ms      INTEGER NOT NULL,
  is_stream       INTEGER NOT NULL DEFAULT 0,       -- 1 if Accept: text/event-stream
  request_bytes   INTEGER,
  response_bytes  INTEGER,
  error_message   TEXT
);
```

## Security notes

- **Plaintext proxy keys are never persisted**. Only `sha256(key)` is stored; the prefix is kept only for display in the admin UI.
- **Upstream Devin tokens are encrypted at rest** (AES-256-GCM) under a master `ENCRYPTION_KEY` that must be supplied via the environment. The proxy refuses to start without it. Storage envelope: `enc:v1:<iv>:<authTag>:<ciphertext>` (base64url). See [Upgrading from v0.1](#upgrading-from-v01) below.
- `ADMIN_API_KEY` is compared with constant-time equality to mitigate timing oracle attacks.
- `adminAuth` returns `401` for missing/invalid Bearer tokens (RFC 7235 compliant); `proxyAuth` returns `401` for missing tokens and `403` for unknown/disabled keys.
- Every request, including authentication rejections, writes a row to `api_usage_logs` for audit purposes. Rejected requests use sentinel `client_key` values (`<missing>`, `<invalid>`) when the caller cannot be identified.
- The proxy **never logs** request or response bodies — only metadata (method, path, status, latency, byte counts).
- Hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, etc.) are stripped before forwarding upstream and before forwarding the response back.

## Upgrading from v0.1

v0.2 introduces mandatory at-rest encryption for upstream Devin tokens. To upgrade an existing database:

1. Generate a 256-bit master key and persist it in your secret store:

   ```bash
   openssl rand -hex 32   # 64-char hex; also accepts base64
   ```

2. Export it before launching the new binary:

   ```bash
   export ENCRYPTION_KEY=<the value from step 1>
   ```

3. Start the proxy. On first boot against a v0.1 database, all existing rows whose `upstream_token` is still plaintext are re-encrypted in a single transaction and a `Re-encrypted legacy plaintext upstream_token rows from v0.1` line is written to the log. The migration is idempotent — subsequent restarts will not touch already-encrypted rows.

4. **Treat `ENCRYPTION_KEY` like a database password**: losing it permanently locks every existing `upstream_token` row. If the key changes, the proxy will fail to start with `ENCRYPTION_KEY does not decrypt existing upstream_token rows` rather than silently 500-ing every request.

## Project layout

```
.
├── src/
│   ├── index.ts                      # entrypoint + graceful shutdown
│   ├── app.ts                        # express app + middleware chain
│   ├── lib/
│   │   ├── config.ts                 # env var loading
│   │   ├── logger.ts                 # pino logger
│   │   ├── db.ts                     # better-sqlite3 connection + migrations
│   │   ├── crypto.ts                 # key generation + sha256 + timing-safe compare
│   │   ├── keys.ts                   # ProxyKey CRUD (transparent encrypt/decrypt)
│   │   ├── encryption.ts             # AES-256-GCM envelope helpers + key validation
│   │   └── usage.ts                  # api_usage_logs insert
│   ├── middlewares/
│   │   ├── rawBody.ts                # capture raw req body for passthrough
│   │   ├── proxyAuth.ts              # validate sk-devin-* key
│   │   └── adminAuth.ts              # validate ADMIN_API_KEY
│   └── routes/
│       ├── health.ts                 # GET /health
│       ├── admin.ts                  # /admin/keys CRUD
│       └── devin.ts                  # /v1/*, /v2/*, /v3/* passthrough
├── scripts/
│   ├── create-key.ts                 # CLI: provision a proxy key
│   └── list-keys.ts                  # CLI: list proxy keys
├── build.mjs                         # esbuild production bundle
├── tsconfig.json
└── package.json
```

## Comparison with `ai-proxy-gateway`

This project is modelled after [`jiankong123/ai-proxy-gateway`](https://github.com/jiankong123/ai-proxy-gateway) but trimmed for the Devin use case:

| Aspect             | ai-proxy-gateway                                          | devin-proxy-gateway                                   |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------- |
| Upstreams          | OpenAI, Anthropic, Gemini, OpenRouter (4 providers)       | Devin only (1 provider, but 3 API versions)           |
| Style              | OpenAI-compatible chat-completions translation layer       | Bare passthrough (Devin's API is not chat-completions) |
| Key model          | Single shared upstream credentials (Replit Integrations)   | Per-key upstream Devin token (multi-tenant)           |
| Storage            | PostgreSQL + Drizzle ORM                                  | SQLite + better-sqlite3                               |
| Layout             | pnpm monorepo with separate dashboard package             | Single Node package                                   |
| Dashboard          | React + Vite admin UI                                     | REST API + CLI only (UI planned for v0.3)             |

## License

MIT
