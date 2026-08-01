# Environment variables

Server-only variables live in the deploy platform. Never expose service-role
keys to the browser.

## Existing (already configured)

| Name                                                         | Scope           | Purpose              |
| ------------------------------------------------------------ | --------------- | -------------------- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | server / client | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | server / client | Publishable anon key |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | server-only     | Admin operations     |
| `LOVABLE_API_KEY`                                            | server-only     | AI gateway auth      |
| `HEALTH_CHECK_SECRET`                                        | server-only     | `/api/health` bearer |
| `LEMONSQUEEZY_*`                                             | server-only     | Billing              |

## Added in this hardening pass

| Name                       | Required                   | Purpose                                                             |
| -------------------------- | -------------------------- | ------------------------------------------------------------------- |
| `AUTH_AUDIT_IP_SALT`       | optional (recommended)     | Per-deploy salt for hashing IPs in `auth_audit_logs`.               |
| `UPSTASH_REDIS_REST_URL`   | required for rate limiting | Upstash REST endpoint. Limiter fails **closed** in prod without it. |
| `UPSTASH_REDIS_REST_TOKEN` | required for rate limiting | Upstash REST token.                                                 |
| `OTLP_ENDPOINT`            | optional                   | If set, OpenTelemetry traces are exported here. Otherwise dormant.  |
| `OTLP_HEADERS`             | optional                   | Comma-separated `key=value` OTLP headers.                           |
| `OTLP_SERVICE_NAME`        | optional                   | Service name for OTel. Defaults to `rizzgod-ai`.                    |

### OpenTelemetry (`src/lib/otel.ts`)

The OTel-lite layer generates W3C `traceparent` values on every server
function entry, propagates `trace_id` into `structured-logger`,
`auth_audit_logs`, and rate-limit events, and exports OTLP/HTTP spans **only
when `OTLP_ENDPOINT` is set**. It never blocks startup: export failures are
logged and swallowed. `validateOtelConfig()` returns `{ ok, active, reason }`
for health checks.

### Security regression CI (`.github/workflows/security-regression.yml`)

Runs on every push, PR, nightly cron, and manual dispatch. Requires:

| Secret                  | Purpose                    |
| ----------------------- | -------------------------- |
| `SUPABASE_ACCESS_TOKEN` | supabase CLI auth          |
| `SUPABASE_PROJECT_REF`  | project the linter targets |

Fails the build on: unresolved HIGH findings, anonymous sign-in enabled,
xp_events RLS drift, non-executable SECURITY DEFINER drift. Uploads
`security-artifacts/lint.json` and `regression-summary.json`.

## CI secrets (`.github/workflows/e2e.yml`)

| Secret                                           | Purpose                                                       |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` | Pre-provisioned e2e account                                   |
| `E2E_BASE_URL`                                   | Base URL for the matrix (defaults to `http://localhost:3000`) |
| `SMOKE_BASE_URL`                                 | Production URL for read-only smoke                            |

## Rate-limiter behaviour

`src/lib/rate-limit.ts` fails **closed** in production when Upstash env vars
are missing: protected paths return `HTTP 503` with
`{ error: "rate_limiter_unavailable" }` rather than silently allowing traffic.
In development it logs a warning and allows the request through.
