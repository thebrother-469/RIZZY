/**
 * Failure-time log-sample retrieval.
 *
 * If `DIAGNOSTICS_LOG_URL` (and optionally `DIAGNOSTICS_LOG_TOKEN`) is
 * configured, we call it with the captured `x-request-id` / `x-trace-id`
 * and return the structured log sample so it can be attached to the
 * Playwright HTML report, JUnit XML, and the GitHub Actions summary.
 *
 * When no endpoint is configured we return a clear "skipped" marker so
 * the captured IDs are still preserved and the operator sees exactly
 * why the sample is missing (instead of a silent no-op).
 */
export interface DiagnosticsSample {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  status?: number;
  requestId?: string | null;
  traceId?: string | null;
  traceparent?: string | null;
  lookupKey?: "x-request-id" | "traceparent" | "x-trace-id" | null;
  body?: unknown;
  summary?: string;
}

export async function fetchDiagnosticsLogSample(ids: {
  requestId?: string | null;
  traceId?: string | null;
  traceparent?: string | null;
}): Promise<DiagnosticsSample> {
  const url = process.env.DIAGNOSTICS_LOG_URL;
  if (!url) {
    return {
      ok: false,
      skipped: true,
      reason: "DIAGNOSTICS_LOG_URL not configured — log retrieval skipped.",
      requestId: ids.requestId ?? null,
      traceId: ids.traceId ?? null,
      traceparent: ids.traceparent ?? null,
      lookupKey: null,
    };
  }
  // Lookup priority: x-request-id > traceparent > x-trace-id.
  let lookupKey: DiagnosticsSample["lookupKey"] = null;
  const qs = new URLSearchParams();
  if (ids.requestId) {
    qs.set("request_id", ids.requestId);
    lookupKey = "x-request-id";
  } else if (ids.traceparent) {
    qs.set("traceparent", ids.traceparent);
    lookupKey = "traceparent";
  } else if (ids.traceId) {
    qs.set("trace_id", ids.traceId);
    lookupKey = "x-trace-id";
  }
  if (!lookupKey) {
    return {
      ok: false,
      skipped: true,
      reason: "No x-request-id / traceparent / x-trace-id captured — nothing to look up.",
      lookupKey: null,
    };
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.DIAGNOSTICS_LOG_TOKEN) {
    headers.authorization = `Bearer ${process.env.DIAGNOSTICS_LOG_TOKEN}`;
  }
  try {
    const res = await fetch(`${url}?${qs.toString()}`, { headers });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* leave as text */
    }
    const summary = summarizeBody(body);
    return {
      ok: res.ok,
      skipped: false,
      status: res.status,
      requestId: ids.requestId ?? null,
      traceId: ids.traceId ?? null,
      traceparent: ids.traceparent ?? null,
      lookupKey,
      body,
      summary,
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: `Diagnostics fetch failed: ${(err as Error).message}`,
      requestId: ids.requestId ?? null,
      traceId: ids.traceId ?? null,
      traceparent: ids.traceparent ?? null,
      lookupKey,
    };
  }
}

function summarizeBody(body: unknown): string {
  if (body == null) return "(empty)";
  if (typeof body === "string") return body.slice(0, 500);
  try {
    const b = body as Record<string, unknown>;
    const level = b.level ?? b.severity;
    const msg = b.message ?? b.msg ?? b.error;
    const status = b.status ?? b.statusCode;
    return (
      [level && `level=${level}`, status && `status=${status}`, msg && `msg=${msg}`]
        .filter(Boolean)
        .join(" ") || JSON.stringify(body).slice(0, 500)
    );
  } catch {
    return JSON.stringify(body).slice(0, 500);
  }
}
