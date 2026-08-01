/**
 * Reusable preflight — verifies required runtime secrets before a suite
 * fires real HTTP against endpoints that would only produce 5xx without
 * them. Returns a `skip(reason)` helper the suite can call in
 * `test.beforeAll` to annotate a clean skip via Playwright.
 */
import { test } from "@playwright/test";

export interface PreflightResult {
  ok: boolean;
  missing: string[];
  reason: string;
}

export function checkRequiredSecrets(required: string[]): PreflightResult {
  const missing = required.filter((k) => !process.env[k] || process.env[k] === "");
  return {
    ok: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? "all required secrets present"
        : `missing required secrets: ${missing.join(", ")}`,
  };
}

/**
 * Call from within a `test.beforeAll` or the top of a `test.describe`
 * (via `test.skip(condition, reason)`) to short-circuit the suite when
 * infrastructure is missing.
 */
export function skipIfMissing(required: string[]): PreflightResult {
  const r = checkRequiredSecrets(required);
  if (!r.ok) test.skip(true, r.reason);
  return r;
}
