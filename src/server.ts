import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { validateEnv } from "./lib/env-validation";
import { reportAiKeyAtStartup } from "./lib/ai-key";

import { logger, newRequestId } from "./lib/structured-logger";

// Run env validation once per worker cold start. We LOG the result (never
// throw at module scope) because the Worker runtime treats module-scope
// throws as an unrecoverable crash — and public routes like /health must
// still be reachable to report the failure to operators.
const __envReport = validateEnv();
if (!__envReport.ok) {
  logger.error("env_validation_failed", {
    missing: __envReport.missing,
    invalid: __envReport.invalid.map((i) => i.name),
  });
} else {
  logger.info("env_validation_ok", { optional_present: __envReport.presentOptional });
}

// Profile-generator AI key probe. Logs operator-facing detail (never the
// secret) at cold start so a missing/placeholder key is visible before the
// first user request instead of surfacing only as a runtime 503.
reportAiKeyAtStartup(process.env, logger);

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Baseline security headers. CSP is shipped in Report-Only mode: it observes
// violations without blocking, so Supabase realtime, Lemon Squeezy checkout,
// and Lovable editor preview keep working while we collect data before
// enforcing.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https://*.lemonsqueezy.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://app.lemonsqueezy.com https://assets.lemonsqueezy.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.lemonsqueezy.com https://api.lemonsqueezy.com",
  "frame-src 'self' https://app.lemonsqueezy.com https://*.lemonsqueezy.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  // `upgrade-insecure-requests` is ignored (and warned) in report-only mode; keep it out.
  "report-uri /api/public/csp-report",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Content-Security-Policy-Report-Only": CSP_REPORT_ONLY,
};

function withSecurityHeaders(response: Response): Response {
  // Response bodies from Cloudflare Workers / TanStack Start are already streamed;
  // we mutate a cloned headers object rather than reading the body.
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = request.headers.get("x-request-id") ?? newRequestId();
    const started = Date.now();
    const url = new URL(request.url);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const secured = withSecurityHeaders(normalized);
      const finalHeaders = new Headers(secured.headers);
      if (!finalHeaders.has("x-request-id")) finalHeaders.set("x-request-id", requestId);
      logger.info("http_request", {
        request_id: requestId,
        route: url.pathname,
        method: request.method,
        status_code: secured.status,
        duration_ms: Date.now() - started,
      });
      return new Response(secured.body, {
        status: secured.status,
        statusText: secured.statusText,
        headers: finalHeaders,
      });
    } catch (error) {
      logger.error("ssr_uncaught", {
        request_id: requestId,
        route: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
      });
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8", "x-request-id": requestId },
        }),
      );
    }
  },
};
