import { reportLovableError } from "./lovable-error-reporting";
import { redactPayload, redactSecrets } from "./redact-secrets";

// React hydration error codes we specifically want to flag.
// 418/423/425 are "Hydration failed / Text content did not match / server HTML".
const HYDRATION_CODES = ["#418", "#423", "#425", "Hydration", "hydrat"];

let installed = false;

export type HydrationReport = {
  kind: "hydration_mismatch";
  route: string;
  pathname: string;
  renderingContext: "client";
  buildId: string | undefined;
  hydrationErrorCode: string;
  timestamp: string;
  message: string;
};

/**
 * Pure builder: derives the redacted diagnostic payload for a hydration error.
 * Exposed for regression tests — it must never include stack traces, cookies,
 * tokens, storage contents, or React component props.
 */
export function buildHydrationReport(
  err: unknown,
  ctx: { pathname: string; buildId?: string | undefined; now?: Date } = {
    pathname: "/",
  },
): HydrationReport {
  const msgRaw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "hydration error";
  const codeMatch = msgRaw.match(/#\d{3}/);
  const code = codeMatch ? codeMatch[0] : "hydration";
  const timestamp = (ctx.now ?? new Date()).toISOString();
  const report: HydrationReport = {
    kind: "hydration_mismatch",
    route: ctx.pathname,
    pathname: ctx.pathname,
    renderingContext: "client",
    buildId: ctx.buildId,
    hydrationErrorCode: code,
    timestamp,
    message: redactSecrets(msgRaw).slice(0, 500),
  };
  return redactPayload(report);
}

function detectBuildId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector('meta[name="build-id"]')?.getAttribute("content") ?? undefined;
}

/**
 * Client-only: patches console.error to detect React hydration mismatches
 * and forwards a redacted diagnostic to Lovable error reporting.
 */
export function installHydrationDiagnostics(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  const buildId = detectBuildId();
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const first = args[0];
      const msg = typeof first === "string" ? first : first instanceof Error ? first.message : "";
      if (msg && HYDRATION_CODES.some((c) => msg.includes(c))) {
        const err =
          args.find((a) => a instanceof Error) instanceof Error
            ? (args.find((a) => a instanceof Error) as Error)
            : new Error(msg);
        const report = buildHydrationReport(err, {
          pathname: window.location?.pathname ?? "/",
          buildId,
        });
        reportLovableError(err, report as unknown as Record<string, unknown>);
      }
    } catch {
      // never let diagnostics break the app
    }
    orig(...(args as [unknown, ...unknown[]]));
  };
}
