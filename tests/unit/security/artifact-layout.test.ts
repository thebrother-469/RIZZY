import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_ARTIFACTS,
  verifyArtifact,
  verifyLayout,
} from "../../../scripts/verify-artifact-layout";
import { buildSuiteArtifact } from "../../../scripts/run-ssr-suites";
import { buildFindingsArtifact } from "../../../scripts/verify-security-findings";
import { buildEvidenceJson, loadSnapshot } from "../../../scripts/generate-security-evidence";

function dir(): string {
  return mkdtempSync(join(tmpdir(), "artifacts-"));
}

describe("artifact layout gate", () => {
  it("requires every standardized artifact", () => {
    const files = REQUIRED_ARTIFACTS.map((a) => a.file);
    for (const f of [
      "graphql-exposure.json",
      "graphql-row-scope.json",
      "production-smoke.json",
      "ssr-smoke.json",
      "hydration-smoke.json",
      "mobile-pwa.json",
      "security-findings.json",
      "security-evidence.md",
      "security-evidence.json",
    ]) {
      expect(files).toContain(f);
    }
  });

  it("fails on a missing artifact", () => {
    const { issues } = verifyLayout(REQUIRED_ARTIFACTS, [], dir());
    expect(issues.length).toBe(REQUIRED_ARTIFACTS.length);
  });

  it("fails on invalid JSON, empty objects and missing keys", () => {
    const d = dir();
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "ssr-smoke.json"), "{not json");
    expect(verifyArtifact({ file: "ssr-smoke.json", kind: "json" }, d)[0]?.problem).toMatch(
      /invalid JSON/,
    );
    writeFileSync(join(d, "ssr-smoke.json"), "{}");
    expect(verifyArtifact({ file: "ssr-smoke.json", kind: "json" }, d)[0]?.problem).toMatch(
      /empty JSON/,
    );
    writeFileSync(join(d, "ssr-smoke.json"), JSON.stringify({ status: "PASS" }));
    expect(
      verifyArtifact({ file: "ssr-smoke.json", kind: "json", requiredKeys: ["summary"] }, d)[0]
        ?.problem,
    ).toMatch(/missing required key/);
  });

  it("fails when an artifact reports FAIL", () => {
    const d = dir();
    writeFileSync(join(d, "x.json"), JSON.stringify({ status: "FAIL", a: 1 }));
    expect(verifyArtifact({ file: "x.json", kind: "json" }, d)[0]?.problem).toMatch(/status FAIL/);
  });

  it("skips explicitly optional artifacts", () => {
    const { skipped, issues } = verifyLayout(
      REQUIRED_ARTIFACTS,
      REQUIRED_ARTIFACTS.map((a) => a.file),
      dir(),
    );
    expect(issues).toEqual([]);
    expect(skipped.length).toBe(REQUIRED_ARTIFACTS.length);
  });
});

describe("suite artifacts", () => {
  const report = {
    testResults: [
      {
        name: "/repo/tests/unit/ssr/smoke.test.ts",
        status: "passed",
        assertionResults: [{ status: "passed" }],
      },
      {
        name: "/repo/tests/unit/ssr/hydration-core-flows.test.ts",
        status: "failed",
        assertionResults: [{ status: "failed", fullName: "x", failureMessages: ["boom"] }],
      },
    ],
  };

  it("splits SSR and hydration results", () => {
    expect(buildSuiteArtifact(report, "ssr-smoke").status).toBe("PASS");
    const h = buildSuiteArtifact(report, "hydration-smoke");
    expect(h.status).toBe("FAIL");
    expect(h.failures[0]?.message).toContain("boom");
  });

  it("reports NOT_VERIFIED when the suite never ran", () => {
    expect(buildSuiteArtifact({}, "ssr-smoke").status).toBe("NOT_VERIFIED");
  });
});

describe("derived security artifacts", () => {
  const snapshot = loadSnapshot();

  it("findings artifact records the gated finding and its allowlist", () => {
    const a = buildFindingsArtifact(snapshot, []);
    const f = a.findings[0]!;
    expect(f.internal_id).toBe("SUPA_pg_graphql_authenticated_table_exposed");
    expect(f.unexpectedTables).toEqual([]);
    expect(f.disposition).toBe("accepted");
    expect(a.status).toBe("PASS");
    expect(verifyArtifact({ file: "f.json", kind: "json" }, ".")).toBeDefined();
  });

  it("findings artifact flips to open when the gate has issues", () => {
    const a = buildFindingsArtifact(snapshot, [{ check: "rls", problem: "x" }]);
    expect(a.status).toBe("FAIL");
    expect(a.findings[0]!.disposition).toBe("open");
  });

  it("evidence json covers every table with policy + grant SQL", () => {
    const j = buildEvidenceJson(snapshot, {});
    expect(j.tables.length).toBe(snapshot.tables.length);
    expect(j.summary.violations).toEqual([]);
    for (const t of j.tables) {
      expect(t.grantSql.length).toBeGreaterThan(0);
      expect(typeof t.authUidVerified).toBe("boolean");
      expect(["PASS", "FAIL", "NOT_VERIFIED"]).toContain(t.rowScopeStatus);
    }
  });
});
