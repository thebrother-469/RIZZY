/**
 * Custom Playwright reporter — surfaces x-request-id / x-trace-id /
 * traceparent captured by tests (via `test-ids` annotations) into:
 *   - the terminal (fail-loud on failure)
 *   - the GitHub Actions job summary
 *   - a machine-readable JSON side-file (test-results/trace-ids.json)
 *
 * Tests emit the payload with:
 *   info.annotations.push({ type: "trace-ids", description: JSON.stringify({...}) })
 * The reporter is registered in playwright.config.ts and runs on every
 * spec — the JSON side-file uploads as part of the standard artifact
 * bundle, so operators can join a failing probe to structured logs /
 * OTLP spans without re-running the suite.
 *
 * Output location: test-results/trace-ids.json (within test-results, NOT playwright-report)
 * This ensures reporter output does not collide with the HTML report (playwright-report/).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type IdRow = {
  test: string;
  status: TestResult["status"];
  endpoint?: string;
  requestId?: string | null;
  traceId?: string | null;
  traceparent?: string | null;
  errorMessage?: string;
};

export default class TraceIdReporter implements Reporter {
  private rows: IdRow[] = [];
  private outFile = resolve("test-results", "trace-ids.json");

  onBegin(_config: FullConfig): void {
    try {
      mkdirSync(dirname(this.outFile), { recursive: true });
    } catch {
      /* noop */
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const annotations = [...test.annotations, ...result.annotations].filter(
      (a) => a.type === "trace-ids",
    );
    if (annotations.length === 0 && result.status !== "failed") return;

    for (const ann of annotations.length ? annotations : [{ description: "{}" }]) {
      let parsed: Partial<IdRow> = {};
      try {
        parsed = JSON.parse(ann.description ?? "{}");
      } catch {
        /* noop */
      }
      this.rows.push({
        test: test.titlePath().slice(1).join(" > "),
        status: result.status,
        endpoint: parsed.endpoint,
        requestId: parsed.requestId ?? null,
        traceId: parsed.traceId ?? null,
        traceparent: parsed.traceparent ?? null,
        errorMessage: result.error?.message,
      });
    }

    if (result.status === "failed") {
      const last = this.rows[this.rows.length - 1];
      const summary = process.env.GITHUB_STEP_SUMMARY;
      const line = `❌ **${test.title}** — request_id=\`${last?.requestId ?? "-"}\` trace_id=\`${last?.traceId ?? "-"}\` traceparent=\`${last?.traceparent ?? "-"}\`\n`;
      if (summary) {
        try {
          appendFileSync(summary, line);
        } catch {
          /* noop */
        }
      }

      console.error("[trace-id-reporter]", line.trim());
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    try {
      writeFileSync(
        this.outFile,
        JSON.stringify({ status: result.status, rows: this.rows }, null, 2),
      );
    } catch {
      /* best effort */
    }

    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      const captured = this.rows.filter((r) => r.requestId || r.traceId || r.traceparent);
      const header =
        `\n### Playwright observability capture (${captured.length} rows)\n\n` +
        `| test | status | request_id | trace_id | traceparent |\n` +
        `| --- | --- | --- | --- | --- |\n`;
      const body = captured
        .slice(0, 200)
        .map(
          (r) =>
            `| ${r.test} | ${r.status} | \`${r.requestId ?? "-"}\` | \`${r.traceId ?? "-"}\` | \`${r.traceparent ?? "-"}\` |`,
        )
        .join("\n");
      try {
        appendFileSync(summary, header + body + "\n");
      } catch {
        /* noop */
      }
    }
  }
}
