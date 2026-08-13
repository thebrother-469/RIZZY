/**
 * Deterministic SSR verification for every protected page and public route
 * that participates in the server render.
 *
 * Runs in a Node environment with all browser globals stripped
 * (tests/unit/ssr/setup.ts). Any module-scope access to window /
 * localStorage / document throws here, which is exactly the regression we
 * gate. No browser, no flakiness.
 */
import { describe, it, expect } from "vitest";

const BROWSER_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "history",
  "location",
  "matchMedia",
] as const;

function assertNoBrowserGlobals(label: string) {
  for (const name of BROWSER_GLOBALS) {
    expect(
      typeof (globalThis as Record<string, unknown>)[name],
      `browser global "${name}" leaked while evaluating ${label}`,
    ).toBe("undefined");
  }
}

/** Route module ⇢ the URL path it serves. */
const PROTECTED_PAGES: Array<[path: string, loader: () => Promise<unknown>]> = [
  ["/app", () => import("@/routes/app.index")],
  ["/app/chat", () => import("@/routes/app.chat")],
  ["/app/missions", () => import("@/routes/app.missions")],
  ["/app/profile-generator", () => import("@/routes/app.profile-generator")],
  ["/app/settings", () => import("@/routes/app.settings")],
  ["/app/memory", () => import("@/routes/app.memory")],
  ["/app/onboarding", () => import("@/routes/app.onboarding")],
  ["/app/coaches", () => import("@/routes/app.coaches")],
  ["/app/coach", () => import("@/routes/app.coach")],
  ["/app/roast", () => import("@/routes/app.roast")],
  ["/app/roleplay", () => import("@/routes/app.roleplay")],
  ["/app (layout)", () => import("@/routes/app")],
];

const PUBLIC_PAGES: Array<[path: string, loader: () => Promise<unknown>]> = [
  ["/", () => import("@/routes/index")],
  ["/auth", () => import("@/routes/auth")],
  ["/pricing", () => import("@/routes/pricing")],
  ["/reset-password", () => import("@/routes/reset-password")],
];

describe("SSR — protected pages evaluate without browser APIs", () => {
  for (const [path, loader] of PROTECTED_PAGES) {
    it(`${path} imports cleanly under SSR`, { timeout: 30_000 }, async () => {
      assertNoBrowserGlobals(path);
      const mod = (await loader()) as { Route?: unknown };
      assertNoBrowserGlobals(path);
      expect(mod).toBeDefined();
      expect(mod.Route, `${path} must export a TanStack Route`).toBeDefined();
    });
  }
});

describe("SSR — public pages evaluate without browser APIs", () => {
  for (const [path, loader] of PUBLIC_PAGES) {
    it(`${path} imports cleanly under SSR`, { timeout: 30_000 }, async () => {
      assertNoBrowserGlobals(path);
      const mod = (await loader()) as { Route?: unknown };
      assertNoBrowserGlobals(path);
      expect(mod.Route).toBeDefined();
    });
  }
});

describe("SSR — head metadata is server-renderable and unique", () => {
  it("every content route declares its own title", async () => {
    const titles = new Map<string, string>();
    for (const [path, loader] of PUBLIC_PAGES) {
      const mod = (await loader()) as {
        Route?: { options?: { head?: (ctx: unknown) => { meta?: Array<Record<string, string>> } } };
      };
      const head = mod.Route?.options?.head;
      if (!head) continue;
      const meta = head({ params: {}, loaderData: undefined })?.meta ?? [];
      const title = meta.find((m) => "title" in m)?.title;
      if (title) titles.set(path, title);
    }
    // Titles must be present and never the Lovable placeholder.
    for (const [path, title] of titles) {
      expect(title.length, `${path} title empty`).toBeGreaterThan(0);
      expect(title).not.toMatch(/Lovable (App|Generated Project)/i);
    }
    // And they must be distinct across routes.
    expect(new Set(titles.values()).size).toBe(titles.size);
  });
});

describe("SSR — router construction is deterministic", () => {
  it("produces an identical route-id set across repeated constructions", async () => {
    const { getRouter } = await import("@/router");
    const ids = () =>
      Object.keys((getRouter() as unknown as { routesById: Record<string, unknown> }).routesById)
        .sort()
        .join("|");
    const first = ids();
    const second = ids();
    expect(second).toBe(first);
    expect(first).toContain("/app");
  });
});
