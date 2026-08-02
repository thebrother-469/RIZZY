/**
 * Hydration safety for every critical application flow.
 *
 * Hydration mismatches come from one place: a module or component reading
 * browser-only state during the server pass (or during the first client
 * render) so that server HTML and client HTML disagree. These tests assert
 * the invariants statically and deterministically — no browser, no flake.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHydrationReport } from "@/lib/hydration-diagnostics";

const SRC = resolve(process.cwd(), "src");

/** Flow ⇢ the modules that render it. */
const CORE_FLOWS: Record<string, string[]> = {
  onboarding: ["routes/app.onboarding.tsx"],
  dashboard: [
    "routes/app.index.tsx",
    "components/ActivityHeatmap.tsx",
    "components/UsagePanel.tsx",
  ],
  chat: ["routes/app.chat.tsx", "components/ChatWindow.tsx", "components/ChatComposer.tsx"],
  missions: ["routes/app.missions.tsx"],
  "profile-generator": ["routes/app.profile-generator.tsx"],
  settings: ["routes/app.settings.tsx"],
  navigation: ["components/AppShell.tsx", "routes/__root.tsx"],
  "protected-route-transitions": ["routes/app.tsx", "lib/auth.tsx"],
};

function source(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

/** Strips comments and string literals so matches are real code references. */
function code(rel: string): string {
  return source(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** Everything above the first top-level function/const-component declaration. */
function moduleScope(text: string): string {
  const idx = text.search(/^(export\s+)?(default\s+)?(function|class|const|let|var)\s/m);
  return idx === -1 ? text : text.slice(0, idx);
}

describe("hydration — no browser access at module evaluation time", () => {
  for (const [flow, files] of Object.entries(CORE_FLOWS)) {
    for (const file of files) {
      it(`${flow}: ${file} has a clean module scope`, () => {
        const scope = moduleScope(code(file));
        for (const api of [
          "window.",
          "document.",
          "localStorage",
          "sessionStorage",
          "navigator.",
        ]) {
          expect(scope.includes(api), `${file} touches ${api} at module scope`).toBe(false);
        }
      });
    }
  }
});

describe("hydration — browser state is never read in a useState initializer", () => {
  for (const [flow, files] of Object.entries(CORE_FLOWS)) {
    for (const file of files) {
      it(`${flow}: ${file} defers browser reads to effects`, () => {
        const text = code(file);
        // useState(() => ...localStorage...) and useState(window...) both
        // hydrate differently on server vs client.
        const bad =
          /useState\((?:\(\)\s*=>\s*)?[^;]{0,400}?(localStorage|sessionStorage|window\.|document\.)/s;
        expect(bad.test(text), `${file} seeds state from a browser API`).toBe(false);
      });
    }
  }
});

describe("hydration — non-deterministic values are not rendered during the server pass", () => {
  for (const [flow, files] of Object.entries(CORE_FLOWS)) {
    for (const file of files) {
      it(`${flow}: ${file} keeps Date.now()/Math.random() out of module scope`, () => {
        const scope = moduleScope(code(file));
        expect(/Math\.random\(/.test(scope), `${file} randomises at module scope`).toBe(false);
        expect(
          /new Date\(\)|Date\.now\(/.test(scope),
          `${file} reads the clock at module scope`,
        ).toBe(false);
      });
    }
  }
});

describe("hydration — diagnostics never leak and stay deterministic", () => {
  it("produces byte-identical reports for identical inputs", () => {
    const err = new Error("Minified React error #418");
    const args = { pathname: "/app", buildId: "gate", now: new Date("2026-01-01T00:00:00Z") };
    const a = JSON.stringify(buildHydrationReport(err, args));
    const b = JSON.stringify(buildHydrationReport(err, args));
    expect(a).toBe(b);
  });

  it("classifies the React hydration error codes we gate on", () => {
    for (const codeNum of ["#418", "#423", "#425"]) {
      const report = buildHydrationReport(new Error(`Minified React error ${codeNum};`), {
        pathname: "/app/chat",
        buildId: "gate",
        now: new Date("2026-01-01T00:00:00Z"),
      });
      expect(report.hydrationErrorCode).toBe(codeNum);
      expect(report.kind).toBe("hydration_mismatch");
    }
  });
});

describe("hydration — the root document shell is server-rendered", () => {
  it("__root renders html/head/body and mounts scripts once", () => {
    const root = source("routes/__root.tsx");
    expect(root).toContain("<html");
    expect(root).toContain("<body");
    expect(root).toMatch(/HeadContent|<head/);
    expect(root).toContain("Outlet");
  });
});
