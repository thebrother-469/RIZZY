import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  enforcesAuthUid,
  grantSql,
  loadSnapshot,
  policySql,
  renderEvidence,
  type TableRecord,
} from "../../../scripts/generate-security-evidence";
import {
  ACCEPTED_EXPOSED_TABLES,
  GATED_FINDING,
  checkDismissal,
  checkEvidence,
  checkExposureShape,
} from "../../../scripts/verify-security-findings";

const snapshot = loadSnapshot();

const table = (name: string): TableRecord => {
  const t = snapshot.tables.find((x) => x.table === name);
  if (!t) throw new Error(`missing ${name}`);
  return t;
};

describe("policy snapshot", () => {
  it("covers every accepted GraphQL-exposed table", () => {
    const exposed = snapshot.tables
      .filter((t) => t.exposure === "authenticated")
      .map((t) => t.table)
      .sort();
    expect(exposed).toEqual([...ACCEPTED_EXPOSED_TABLES].sort());
  });

  it("has RLS on every table, no anon grant, and auth.uid() scoping", () => {
    for (const t of snapshot.tables) {
      expect(t.rlsEnabled, t.table).toBe(true);
      expect(t.grants["anon"], t.table).toBeUndefined();
      expect(enforcesAuthUid(t), t.table).toBe(true);
    }
  });
});

describe("SQL rendering", () => {
  it("renders an exact CREATE POLICY statement", () => {
    const sql = policySql("missions", "public", table("missions").policies[0]!);
    expect(sql).toContain('CREATE POLICY "own missions read"');
    expect(sql).toContain("ON public.missions");
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("auth.uid()");
    expect(sql.endsWith(";")).toBe(true);
  });

  it("renders GRANTs and calls out roles with no privileges", () => {
    const sql = grantSql("user_xp", "public", table("user_xp").grants);
    expect(sql).toContain("GRANT SELECT ON public.user_xp TO authenticated;");
    expect(sql).toContain("-- no privileges granted to anon");
  });

  it("flags a table whose client policy is not auth.uid()-scoped", () => {
    expect(
      enforcesAuthUid({
        ...table("missions"),
        policies: [
          {
            name: "wide open",
            cmd: "SELECT",
            roles: ["authenticated"],
            permissive: "PERMISSIVE",
            using: "(true)",
            withCheck: null,
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("evidence report", () => {
  const md = renderEvidence(snapshot, new Date("2026-08-03T00:00:00.000Z"));

  it("documents every exposed table with its SQL", () => {
    for (const name of ACCEPTED_EXPOSED_TABLES) {
      expect(md, name).toContain(`### \`public.${name}\``);
    }
    expect(md).toContain("Policy violations detected: **0**");
    expect(md).toContain("SELECT policy SQL");
    expect(md).toContain("DELETE policy SQL");
  });

  it("is committed in the standardized artifact location", () => {
    expect(existsSync("security-artifacts/security-evidence.md")).toBe(true);
    expect(readFileSync("security-artifacts/security-evidence.md", "utf8")).toContain(
      GATED_FINDING,
    );
  });
});

describe("release finding gate", () => {
  it("passes on the current repository state", () => {
    expect(checkDismissal()).toEqual([]);
    expect(checkExposureShape(snapshot.tables)).toEqual([]);
    expect(checkEvidence()).toEqual([]);
  });

  it("fails when a new table becomes exposed", () => {
    const issues = checkExposureShape([
      ...snapshot.tables,
      { ...table("missions"), table: "secret_notes" },
    ]);
    expect(issues.some((i) => i.problem.includes("secret_notes"))).toBe(true);
  });

  it("fails when RLS is disabled or anon gains a grant", () => {
    const broken = snapshot.tables.map((t) =>
      t.table === "chats"
        ? { ...t, rlsEnabled: false, grants: { ...t.grants, anon: "SELECT" } }
        : t,
    );
    const issues = checkExposureShape(broken);
    expect(issues.some((i) => i.check === "rls")).toBe(true);
    expect(issues.some((i) => i.check === "anon-grant")).toBe(true);
  });
});
