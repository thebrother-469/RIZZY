import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 8 * 1024;

type CspFields = {
  "blocked-uri"?: unknown;
  "violated-directive"?: unknown;
  "effective-directive"?: unknown;
  "source-file"?: unknown;
  "line-number"?: unknown;
  "status-code"?: unknown;
};

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length < 512 ? v : undefined;
}
function pickNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const len = Number(request.headers.get("content-length") ?? "0");
          if (len > MAX_BYTES) return new Response(null, { status: 204 });
          const raw = await request.text();
          if (raw.length > MAX_BYTES) return new Response(null, { status: 204 });

          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return new Response(null, { status: 204 });
          }

          // Support both legacy report-uri ({ "csp-report": {...} }) and Reporting API (array of { body }).
          const reports: CspFields[] = [];
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const body = (item as { body?: unknown })?.body;
              if (body && typeof body === "object") reports.push(body as CspFields);
            }
          } else if (parsed && typeof parsed === "object") {
            const legacy = (parsed as { "csp-report"?: unknown })["csp-report"];
            if (legacy && typeof legacy === "object") reports.push(legacy as CspFields);
          }

          for (const r of reports) {
            const safe = {
              blockedUri: pickStr(r["blocked-uri"]),
              violatedDirective: pickStr(r["violated-directive"]),
              effectiveDirective: pickStr(r["effective-directive"]),
              sourceFile: pickStr(r["source-file"]),
              lineNumber: pickNum(r["line-number"]),
              statusCode: pickNum(r["status-code"]),
            };
            console.warn("[csp-report]", JSON.stringify(safe));
          }
        } catch {
          // Swallow — never surface parsing errors to the reporter.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
