/**
 * OpenTelemetry-lite: W3C traceparent generation and OTLP/HTTP export.
 *
 * Activates ONLY when `OTLP_ENDPOINT` is set. Never blocks startup. Never
 * throws — export failures are logged and swallowed. Uses `fetch` so it
 * works on Cloudflare Workers / edge runtimes with no SDK.
 *
 * Env vars:
 *   OTLP_ENDPOINT      — full URL to POST spans (e.g. https://otlp.example.com/v1/traces)
 *   OTLP_HEADERS       — comma-separated `k=v` header pairs (e.g. "api-key=xxx,team=abc")
 *   OTLP_SERVICE_NAME  — service.name resource attribute (default "rizzgod-ai")
 */

function randHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let hex = "";
  for (const b of arr) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** New 128-bit trace id (32 hex chars) per W3C spec. */
export function newTraceId(): string {
  return randHex(16);
}

/** New 64-bit span id (16 hex chars). */
export function newSpanId(): string {
  return randHex(8);
}

/** Build a W3C traceparent string. */
export function makeTraceparent(traceId?: string, spanId?: string): string {
  return `00-${traceId ?? newTraceId()}-${spanId ?? newSpanId()}-01`;
}

/** Extract trace_id from an incoming `traceparent` header (or null if bad). */
export function parseTraceparent(header: string | null | undefined): {
  trace_id: string;
  span_id: string;
} | null {
  if (!header) return null;
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(header.trim());
  if (!m) return null;
  return { trace_id: m[1], span_id: m[2] };
}

export interface TraceCtx {
  request_id: string;
  trace_id: string;
  span_id: string;
  traceparent: string;
}

/**
 * Resolve or generate a trace context. Prefers an inbound `traceparent`
 * so distributed traces are stitched together upstream.
 */
export function resolveTraceContext(
  incomingTraceparent: string | null | undefined,
  request_id: string,
): TraceCtx {
  const parsed = parseTraceparent(incomingTraceparent);
  const trace_id = parsed?.trace_id ?? newTraceId();
  const span_id = newSpanId();
  return { request_id, trace_id, span_id, traceparent: `00-${trace_id}-${span_id}-01` };
}

function otlpEnv(): { endpoint: string; headers: Record<string, string>; service: string } | null {
  const endpoint = process.env.OTLP_ENDPOINT;
  if (!endpoint) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const raw = process.env.OTLP_HEADERS ?? "";
  for (const pair of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const eq = pair.indexOf("=");
    if (eq > 0) headers[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return { endpoint, headers, service: process.env.OTLP_SERVICE_NAME ?? "rizzgod-ai" };
}

export interface SpanRecord {
  name: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  start_ms: number;
  end_ms: number;
  attributes?: Record<string, string | number | boolean>;
  status?: "OK" | "ERROR";
}

/**
 * Fire-and-forget OTLP/HTTP export. Never throws, never blocks the caller
 * beyond the network round-trip; wrap in a promise the caller can ignore.
 * When OTLP_ENDPOINT is unset this is a no-op.
 */
export async function exportSpan(span: SpanRecord): Promise<void> {
  const env = otlpEnv();
  if (!env) return;
  const durationNs = Math.max(1, span.end_ms - span.start_ms) * 1_000_000;
  const body = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: env.service } }] },
        scopeSpans: [
          {
            scope: { name: "rizzgod.otel-lite" },
            spans: [
              {
                traceId: span.trace_id,
                spanId: span.span_id,
                parentSpanId: span.parent_span_id,
                name: span.name,
                kind: 2, // SPAN_KIND_SERVER
                startTimeUnixNano: String(span.start_ms * 1_000_000),
                endTimeUnixNano: String(span.start_ms * 1_000_000 + durationNs),
                attributes: Object.entries(span.attributes ?? {}).map(([k, v]) => ({
                  key: k,
                  value:
                    typeof v === "number"
                      ? { intValue: String(Math.trunc(v)) }
                      : typeof v === "boolean"
                        ? { boolValue: v }
                        : { stringValue: String(v) },
                })),
                status: { code: span.status === "ERROR" ? 2 : 1 },
              },
            ],
          },
        ],
      },
    ],
  };
  try {
    const res = await fetch(env.endpoint, {
      method: "POST",
      headers: env.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Log via console to avoid a circular import with structured-logger.
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "otlp_export_non_2xx",
          status: res.status,
        }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "otlp_export_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/**
 * Startup-time validation. Called from server-fn handlers or health checks
 * to surface a misconfiguration without crashing. Returns { ok } always.
 */
export function validateOtelConfig(): { ok: boolean; reason?: string; active: boolean } {
  const endpoint = process.env.OTLP_ENDPOINT;
  if (!endpoint) return { ok: true, active: false, reason: "OTLP_ENDPOINT unset — OTel dormant" };
  try {
    new URL(endpoint);
  } catch {
    return { ok: false, active: false, reason: "OTLP_ENDPOINT is not a valid URL" };
  }
  return { ok: true, active: true };
}
