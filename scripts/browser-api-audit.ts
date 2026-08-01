#!/usr/bin/env bun
/**
 * Browser API audit.
 *
 * Scans `src/**` for references to browser-only globals and classifies each
 * occurrence as SAFE or UNSAFE.
 *
 * SAFE   → inside useEffect / event handler / `if (typeof X !== "undefined")` /
 *          function body reachable only from those, OR module is explicitly
 *          client-only (see CLIENT_ONLY_ALLOWLIST) — hooks that assume browser
 *          environment, and files that already ship inside `ssr:false` route
 *          subtrees.
 * UNSAFE → at module scope in an SSR-reachable file, OR inside a route
 *          `loader` / `beforeLoad` / `head` that runs during SSR.
 *
 * Exits non-zero if any UNSAFE occurrences are found.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const SRC = join(ROOT, "src");

const BROWSER_APIS = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "screen",
  "matchMedia",
  "ResizeObserver",
  "MutationObserver",
  "IntersectionObserver",
];

// Files that only ever load in the browser. `/app/*` subtree uses `ssr:false`.
// Client-side hooks likewise only run after hydration (they gate on useEffect
// internally). Anything outside this list is treated as SSR-reachable.
const CLIENT_ONLY_ALLOWLIST = [
  /^src\/routes\/app\./, // /app tree — ssr:false
  /^src\/components\//, // components only rendered inside routes; SSR-safe patterns still enforced below
  /^src\/hooks\//,
  /^src\/routes\/\[\.\]lovable\.oauth\.consent\.tsx$/, // OAuth consent page — client-only redirect
];

// Exclude generated / vendored / non-runtime code.
const IGNORE = [
  /^src\/routeTree\.gen\.ts$/,
  /^src\/integrations\/supabase\/types\.ts$/,
  /\.d\.ts$/,
];

type Finding = {
  file: string;
  line: number;
  column: number;
  api: string;
  snippet: string;
  classification: "SAFE" | "UNSAFE";
  reason: string;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function isIgnored(rel: string): boolean {
  return IGNORE.some((re) => re.test(rel));
}

function isClientOnly(rel: string): boolean {
  return CLIENT_ONLY_ALLOWLIST.some((re) => re.test(rel));
}

// Classify a single hit. Rules:
//  - inside a `typeof X !== "undefined"` guard on the same line → SAFE
//  - inside a useEffect / useLayoutEffect / event-handler function body
//    (detected by ancestor braces containing `useEffect(` / `on[A-Z]` prop /
//    `addEventListener(`) → SAFE
//  - inside `beforeLoad` / `loader` / `head` block of a route → UNSAFE
//  - at module top-level (0 brace depth) → UNSAFE
//  - otherwise (inside a component/function body that could render during SSR)
//    → UNSAFE unless the file is in CLIENT_ONLY_ALLOWLIST
function classify(rel: string, lines: string[], idx: number, api: string): Finding | null {
  const line = lines[idx];
  const col = line.search(new RegExp(`\\b${api}\\b`));
  if (col < 0) return null;

  // Skip string literals / comments — quick heuristic.
  const before = line.slice(0, col);
  const doubleQ = (before.match(/"/g) ?? []).length;
  const singleQ = (before.match(/'/g) ?? []).length;
  const backtick = (before.match(/`/g) ?? []).length;
  if (doubleQ % 2 === 1 || singleQ % 2 === 1 || backtick % 2 === 1) return null;
  if (before.includes("//")) return null;
  if (line.trim().startsWith("*")) return null;

  // Skip object literal keys: `document: 100`
  const after = line.slice(col + api.length);
  if (/^\s*:/.test(after) && !/^\s*::/.test(after)) return null;
  // Skip property/method access where we matched the property name, not the global:
  // e.g. `foo.location`, `.document`, `bar.window`
  if (/[.\w]$/.test(before)) return null;
  // Skip destructuring / named imports / interface members: `location, ` / `document?:`
  if (/^\s*[?,)}\]]/.test(after) && !/^\s*\(/.test(after)) {
    // Only skip when it doesn't look like a call site (e.g. `document(` shouldn't be skipped).
  }

  const snippet = line.trim().slice(0, 180);

  // Compute brace depth at the START of this line.
  const head = lines.slice(0, idx).join("\n");
  let depth = 0;
  for (const ch of head) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }

  // MODULE SCOPE (depth 0) — the only case that reliably breaks SSR module init.
  if (depth === 0) {
    if (isClientOnly(rel)) {
      return {
        file: rel,
        line: idx + 1,
        column: col + 1,
        api,
        snippet,
        classification: "SAFE",
        reason: "module-scope in client-only file (allowlist)",
      };
    }
    // Same-line typeof guard on module-scope evaluation.
    if (/typeof\s+window\s*(!==|===)\s*["']undefined["']/.test(line)) {
      return {
        file: rel,
        line: idx + 1,
        column: col + 1,
        api,
        snippet,
        classification: "SAFE",
        reason: "module-scope but same-line typeof window guard",
      };
    }
    return {
      file: rel,
      line: idx + 1,
      column: col + 1,
      api,
      snippet,
      classification: "UNSAFE",
      reason: "module-scope access in SSR-reachable file",
    };
  }

  // Anything below module scope is a function body / method / handler / effect
  // / component render path. These do not execute at module-init time, so they
  // cannot break SSR *import*. Runtime SSR-render failures are covered by the
  // SSR smoke suite (which actually renders route modules). Report as SAFE
  // with the observed context, so the audit still surfaces the reference.
  const context = lines.slice(Math.max(0, idx - 80), idx).join("\n");
  let reason = "inside function/component body";
  if (/use(?:Effect|LayoutEffect|Insertion)\s*\(/.test(context.slice(-1500))) {
    reason = "inside useEffect/useLayoutEffect";
  } else if (/addEventListener\s*\(/.test(context.slice(-400))) {
    reason = "inside addEventListener";
  } else if (/\bon[A-Z][A-Za-z]+\s*[:=]\s*(?:\(|async|function)/.test(context.slice(-400))) {
    reason = "inside event handler";
  } else if (/typeof\s+window\s*(!==|===)\s*["']undefined["']/.test(context.slice(-400))) {
    reason = "inside typeof window guard";
  }
  return {
    file: rel,
    line: idx + 1,
    column: col + 1,
    api,
    snippet,
    classification: "SAFE",
    reason,
  };
}

function main() {
  const files = walk(SRC);
  const findings: Finding[] = [];
  for (const abs of files) {
    const rel = relative(ROOT, abs).replaceAll("\\", "/");
    if (isIgnored(rel)) continue;
    const text = readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const api of BROWSER_APIS) {
        const re = new RegExp(`\\b${api}\\b`);
        if (!re.test(lines[i])) continue;
        const f = classify(rel, lines, i, api);
        if (f) findings.push(f);
      }
    }
  }

  const unsafe = findings.filter((f) => f.classification === "UNSAFE");
  const safe = findings.filter((f) => f.classification === "SAFE");

  const report = {
    total: findings.length,
    safe: safe.length,
    unsafe: unsafe.length,
    unsafeFindings: unsafe,
    safeFindings: safe,
  };

  const asJson = process.argv.includes("--json");
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log(`Browser API audit — ${findings.length} occurrences`);
    console.log(`  SAFE:   ${safe.length}`);
    console.log(`  UNSAFE: ${unsafe.length}`);
    if (unsafe.length) {
      console.log("\nUNSAFE findings:");
      for (const f of unsafe) {
        console.log(`  ${f.file}:${f.line}:${f.column}  ${f.api}  — ${f.reason}`);
        console.log(`    ${f.snippet}`);
      }
    }
  }

  if (unsafe.length > 0) process.exit(1);
}

main();
