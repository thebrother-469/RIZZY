/**
 * Shared /api/healthz + /api/public/health handler.
 * Kept as a plain function so both routes stay identical byte-for-byte.
 */

type CheckStatus = "ok" | "fail" | "skipped";

interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  checks?: {
    ssr: CheckStatus;
    env: { status: CheckStatus; missing: string[] };
    supabase_db: { status: CheckStatus; latency_ms: number | null };
    supabase_auth: { status: CheckStatus; latency_ms: number | null };
  };
  uptime_seconds?: number;
  environment?: string;
  version?: string | null;
  git_commit?: string | null;
}

const START_TIME = Date.now();

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function timedFetch(url: string, init: RequestInit, timeoutMs = 3000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { ok: res.ok, status: res.status, latency: Date.now() - started };
  } catch {
    return { ok: false, status: 0, latency: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

export async function handleHealthz(request: Request): Promise<Response> {
  const requiredEnv = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  if (present("LEMONSQUEEZY_API_KEY")) requiredEnv.push("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (present("PADDLE_API_KEY")) requiredEnv.push("PADDLE_WEBHOOK_SECRET");
  const missing = requiredEnv.filter((n) => !present(n));
  const envCheck: CheckStatus = missing.length === 0 ? "ok" : "fail";

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  // The PostgREST root endpoint (`/rest/v1/`) now accepts only the service role
  // key, so the DB probe must use it. Server-only; never sent to the client.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let dbStatus: CheckStatus = "skipped";
  let dbLatency: number | null = null;
  let authStatus: CheckStatus = "skipped";
  let authLatency: number | null = null;

  if (url && anon) {
    if (serviceKey) {
      const db = await timedFetch(`${url}/rest/v1/`, {
        method: "GET",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      dbLatency = db.latency;
      dbStatus = db.ok || db.status === 404 ? "ok" : "fail";
    }

    const auth = await timedFetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: anon },
    });
    authLatency = auth.latency;
    authStatus = auth.ok ? "ok" : "fail";
  }

  const healthy = envCheck === "ok" && dbStatus !== "fail" && authStatus !== "fail";

  const providedSecret = request.headers.get("x-health-secret") ?? "";
  const expectedSecret = process.env.HEALTH_CHECK_SECRET ?? "";
  const authorized =
    expectedSecret.length > 0 &&
    providedSecret.length > 0 &&
    timingSafeEqualStr(providedSecret, expectedSecret);

  const body: HealthResponse = authorized
    ? {
        status: healthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
        environment: process.env.NODE_ENV ?? "unknown",
        version: process.env.DEPLOYMENT_VERSION ?? process.env.VERCEL_DEPLOYMENT_ID ?? null,
        git_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
        checks: {
          ssr: "ok",
          env: { status: envCheck, missing },
          supabase_db: { status: dbStatus, latency_ms: dbLatency },
          supabase_auth: { status: authStatus, latency_ms: authLatency },
        },
      }
    : {
        status: healthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
      };

  return new Response(JSON.stringify(body), {
    status: healthy ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
