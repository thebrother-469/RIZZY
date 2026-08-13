import { describe, it, expect } from "vitest";

/**
 * SSR smoke test — runs in Node (no window/document/localStorage/etc).
 * Any imported module that reads a browser global at module scope will
 * throw a ReferenceError here and fail the test, which is exactly the
 * regression signal we want gated in CI.
 */

function assertNoBrowserGlobals() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  for (const name of [
    "window",
    "document",
    "navigator",
    "localStorage",
    "sessionStorage",
    "history",
    "location",
    "matchMedia",
    "MutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
    "screen",
  ]) {
    expect(typeof g[name], `browser global "${name}" leaked into node env`).toBe("undefined");
  }
}

// Every module that is reachable during SSR. `/app/*` is `ssr:false` and is
// intentionally excluded — but the parent `app.tsx` layout module IS reached
// (its route config is registered on the router even when SSR is disabled),
// so we include it.
const SSR_REACHABLE_MODULES: Array<[string, () => Promise<unknown>]> = [
  ["router", () => import("@/router")],
  ["routeTree.gen", () => import("@/routeTree.gen")],
  ["__root", () => import("@/routes/__root")],
  ["routes/index", () => import("@/routes/index")],
  ["routes/auth", () => import("@/routes/auth")],
  ["routes/pricing", () => import("@/routes/pricing")],
  ["routes/reset-password", () => import("@/routes/reset-password")],
  ["routes/privacy", () => import("@/routes/privacy")],
  ["routes/terms", () => import("@/routes/terms")],
  ["routes/refund-policy", () => import("@/routes/refund-policy")],
  ["routes/ai-dating-guide", () => import("@/routes/ai-dating-guide")],
  ["routes/dating-profile-generator", () => import("@/routes/dating-profile-generator")],
  ["routes/flirty-text-messages", () => import("@/routes/flirty-text-messages")],
  ["routes/hinge-openers", () => import("@/routes/hinge-openers")],
  ["routes/tinder-openers", () => import("@/routes/tinder-openers")],
  ["routes/app (layout)", () => import("@/routes/app")],
  ["integrations/supabase/client", () => import("@/integrations/supabase/client")],
  ["lib/auth", () => import("@/lib/auth")],
  ["lib/hydration-diagnostics", () => import("@/lib/hydration-diagnostics")],
  ["lib/lovable-error-reporting", () => import("@/lib/lovable-error-reporting")],
  ["lib/error-capture", () => import("@/lib/error-capture")],
  ["lib/error-page", () => import("@/lib/error-page")],
  ["lib/redact-secrets", () => import("@/lib/redact-secrets")],
  ["lib/utils", () => import("@/lib/utils")],
  ["lib/entitlements", () => import("@/lib/entitlements")],
  ["lib/coaches", () => import("@/lib/coaches")],
];

describe("SSR smoke — environment", () => {
  it("has no browser globals", () => {
    assertNoBrowserGlobals();
  });
});

describe("SSR smoke — module imports", () => {
  for (const [label, loader] of SSR_REACHABLE_MODULES) {
    it(`imports ${label} without touching browser APIs`, { timeout: 30_000 }, async () => {
      assertNoBrowserGlobals();
      let mod: unknown;
      try {
        mod = await loader();
      } catch (e) {
        // Surface the exact ReferenceError / init failure with the module label.
        throw new Error(`Import failed for ${label}: ${(e as Error).stack ?? e}`, { cause: e });
      }
      expect(mod).toBeDefined();
    });
  }
});

describe("SSR smoke — router construction", () => {
  it("constructs router without touching browser APIs", async () => {
    assertNoBrowserGlobals();
    const mod = await import("@/router");
    const router = mod.getRouter();
    expect(router).toBeDefined();
  });
});
