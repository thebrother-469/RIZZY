import { describe, it, expect } from "vitest";
import {
  loadSecurityMemory,
  validateSecurityMemory,
  type DismissalRecord,
} from "../../../scripts/verify-security-memory";

const valid: DismissalRecord = {
  internal_id: "SUPA_example_finding",
  title: "Example finding",
  rationale:
    "This is an intentionally long rationale explaining exactly why the finding does not apply to this application.",
  severity: "WARN",
  reviewer: "lovable-agent",
  reviewedAt: "2026-07-31T00:00:00.000Z",
  rescannedAt: "2026-07-31T00:00:00.000Z",
  nextRescanAt: "2026-10-29T00:00:00.000Z",
  commit: "ad42a05ac382da322e7c509145d675a1a953e12b",
  branch: "main",
  evidence:
    "Live anonymous GraphQL probe returned HTTP 200 with zero rows for every affected collection.",
};

const NOW = new Date("2026-07-31T00:00:00.000Z");

describe("security dismissal registry validation", () => {
  it("accepts a complete, unexpired record", () => {
    expect(validateSecurityMemory({ dismissals: [valid] }, NOW).ok).toBe(true);
  });

  it("fails duplicate internal_id values", () => {
    const res = validateSecurityMemory({ dismissals: [valid, { ...valid }] }, NOW);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.problem.includes("duplicate"))).toBe(true);
  });

  it("fails expired re-scan timestamps", () => {
    const res = validateSecurityMemory(
      { dismissals: [{ ...valid, nextRescanAt: "2026-01-01T00:00:00.000Z" }] },
      NOW,
    );
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.problem.includes("expired"))).toBe(true);
  });

  it("fails malformed records", () => {
    for (const bad of [
      { ...valid, reviewer: "" },
      { ...valid, commit: "not-a-sha" },
      { ...valid, reviewedAt: "31/07/2026" },
      { ...valid, rationale: "too short" },
      { ...valid, severity: "SPICY" },
      { ...valid, evidence: "n/a" },
      { ...valid, branch: "" },
      { ...valid, rescannedAt: "yesterday" },
      "not-an-object",
    ]) {
      expect(validateSecurityMemory({ dismissals: [bad] }, NOW).ok).toBe(false);
    }
    expect(validateSecurityMemory({ dismissals: "nope" }, NOW).ok).toBe(false);
  });
});

describe("the committed registry itself", () => {
  it("is valid right now", () => {
    const res = validateSecurityMemory(loadSecurityMemory());
    expect(res.issues).toEqual([]);
    expect(res.count).toBeGreaterThan(0);
  });
});
