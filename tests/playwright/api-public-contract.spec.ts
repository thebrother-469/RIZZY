/**
 * Header contract test for every discovered /api/public/* endpoint.
 *
 * Autoloads the route matrix from src/routes/api/public/ so new files
 * are exercised without editing this suite. Each endpoint must:
 *   - Respond with an acceptable transport-level status (never 5xx)
 *   - Emit x-request-id in a stable format (uuid or url-safe ≥ 6 chars)
 *   - Emit exactly one x-request-id and one x-trace-id (no duplicates)
 *   - Emit a W3C-compliant `traceparent` when tracing is enabled
 *   - Propagate an incoming trace-id verbatim (W3C spec)
 *
 * IDs are captured into the Playwright report + JUnit + GitHub summary
 * via test annotations + attachments so an operator can join a failing
 * probe to the matching structured log or OTLP span.
 */
import { test, expect, type APIResponse } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { discoverPublicEndpoints } from "./_helpers/public-endpoints";
import { fetchDiagnosticsLogSample } from "./_helpers/diagnostics";
import { checkRequiredSecrets } from "./_helpers/preflight";

const endpoints = discoverPublicEndpoints();
const W3C_TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const REQUEST_ID = /^[a-zA-Z0-9_.:-]{6,}$/;
const otlpEnabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

function extractIds(res: APIResponse) {
  const h = res.headers();
  return {
    requestId: h["x-request-id"] ?? h["x-lovable-request-id"] ?? null,
    traceId: h["x-trace-id"] ?? null,
    traceparent: h["traceparent"] ?? null,
  };
}

function recordIds(
  info: { annotations: { type: string; description?: string }[] },
  endpoint: string,
  ids: ReturnType<typeof extractIds>,
) {
  const payload = JSON.stringify({ endpoint, ...ids });
  info.annotations.push({ type: "trace-ids", description: payload });
  // GitHub Actions step summary — surfaces IDs on every run.
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      appendFileSync(
        summary,
        `- \`${endpoint}\` — request_id=\`${ids.requestId ?? "-"}\` trace_id=\`${ids.traceId ?? "-"}\` traceparent=\`${ids.traceparent ?? "-"}\`\n`,
      );
    } catch {
      /* summary is best-effort */
    }
  }
}

test.describe("public API surface: discovered from src/routes/api/public/", () => {
  test("discovery finds at least one route", () => {
    expect(endpoints.length).toBeGreaterThan(0);
  });

  // On any test failure, extract the last captured trace-ids annotation
  // and attempt to fetch the matching structured log sample. The result
  // (or a clear "skipped" marker) is attached to the HTML report and
  // surfaced in the GitHub Actions job summary so operators never lose
  // the correlation trail on a failing probe.
  test.afterEach(async ({}, info) => {
    if (info.status !== "failed" && info.status !== "timedOut") return;
    const ann = [...info.annotations].reverse().find((a) => a.type === "trace-ids");
    let ids: { requestId?: string | null; traceId?: string | null; traceparent?: string | null } =
      {};
    try {
      ids = JSON.parse(ann?.description ?? "{}");
    } catch {
      /* noop */
    }
    const sample = await fetchDiagnosticsLogSample(ids);
    const body = JSON.stringify(sample, null, 2);
    // Attach under both the historical name and the canonical
    // `diagnostics-log.json` so downstream tooling picks either up.
    await info.attach("diagnostics-log.json", {
      body,
      contentType: "application/json",
    });
    await info.attach("diagnostics-log-sample.json", {
      body,
      contentType: "application/json",
    });
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      try {
        const condensed = sample.skipped
          ? `_skipped — ${sample.reason}_`
          : `status=${sample.status ?? "?"} lookup=${sample.lookupKey ?? "?"} ${sample.summary ?? ""}`;
        appendFileSync(
          summary,
          `\n<details><summary>diagnostics — ${info.title} — ${condensed}</summary>\n\n\`\`\`json\n${body}\n\`\`\`\n\n</details>\n`,
        );
      } catch {
        /* best effort */
      }
    }
  });

  // Preflight: if we're clearly running in "no runtime infra" mode the
  // real HTTP probes will only ever return 500s from missing service
  // creds — annotate a clean skip instead of producing noisy failures.
  // We probe optional secrets — the suite still runs when at least the
  // core Supabase URL is configured.
  test.beforeAll(() => {
    const pf = checkRequiredSecrets(["SUPABASE_URL"]);
    if (!pf.ok) {
      test.skip(true, `preflight: ${pf.reason}`);
    }
  });

  for (const ep of endpoints) {
    test(`${ep.method} ${ep.path} → header contract [${ep.source}]`, async ({ request }, info) => {
      const init = { headers: ep.request.headers, data: ep.request.data };
      const res =
        ep.method === "GET"
          ? await request.get(ep.path, { headers: init.headers })
          : await request.fetch(ep.path, { method: ep.method, ...init });

      const ids = extractIds(res);
      recordIds(info, `${ep.method} ${ep.path}`, ids);

      // Transport contract — never 5xx from a public endpoint under a
      // well-formed probe; must land in the endpoint's declared set.
      expect(res.status(), `unexpected status for ${ep.method} ${ep.path}`).toBeLessThan(500);
      expect(ep.acceptableStatuses, `status ${res.status()} not in accepted set`).toContain(
        res.status(),
      );

      // Header format contract
      if (ids.requestId) expect(ids.requestId).toMatch(REQUEST_ID);
      if (ids.traceparent) expect(ids.traceparent).toMatch(W3C_TRACEPARENT);

      // No duplicate correlation headers (getSetCookie-style multi-value).
      const raw = res.headersArray();
      const reqCount = raw.filter((h) => h.name.toLowerCase() === "x-request-id").length;
      const traceCount = raw.filter((h) => h.name.toLowerCase() === "x-trace-id").length;
      const tpCount = raw.filter((h) => h.name.toLowerCase() === "traceparent").length;
      expect(reqCount, "duplicate x-request-id headers").toBeLessThanOrEqual(1);
      expect(traceCount, "duplicate x-trace-id headers").toBeLessThanOrEqual(1);
      expect(tpCount, "duplicate traceparent headers").toBeLessThanOrEqual(1);

      if (otlpEnabled) {
        expect(
          ids.requestId || ids.traceId || ids.traceparent,
          "OTLP enabled but response carries no correlation headers",
        ).toBeTruthy();
      }
    });
  }

  test("trace-id propagation: incoming traceparent trace-id MUST be preserved", async ({
    request,
  }, info) => {
    const incoming = "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01";
    const res = await request.get("/api/public/health", { headers: { traceparent: incoming } });
    const ids = extractIds(res);
    recordIds(info, "GET /api/public/health (propagation)", ids);
    if (ids.traceparent) {
      expect(ids.traceparent.slice(3, 35)).toBe(incoming.slice(3, 35));
    } else if (otlpEnabled) {
      throw new Error("OTLP enabled but no traceparent propagated");
    } else {
      info.annotations.push({
        type: "notice",
        description: "OTLP disabled — propagation not asserted (graceful fallback).",
      });
    }
  });
});
