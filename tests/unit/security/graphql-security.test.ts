/**
 * GraphQL security verification tests.
 *
 * The pure assessment logic is always tested. The LIVE probes execute real
 * pg_graphql queries and only run when the corresponding credentials are
 * bound to the runtime — otherwise they are skipped loudly (never faked).
 */
import { describe, it, expect } from "vitest";
import {
  ANON_FORBIDDEN_COLLECTIONS,
  assessTableGrants,
  edgeCount,
  isCollectionHidden,
  verifyAnonGraphql,
  verifyAuthenticatedGraphql,
  type TableGrantRow,
} from "../../../scripts/verify-graphql-security";

const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;
const e2eEmail = process.env.E2E_TEST_USER_EMAIL;
const e2ePassword = process.env.E2E_TEST_USER_PASSWORD;

describe("pg_graphql response classification", () => {
  it("detects a collection hidden by a missing grant", () => {
    const res = {
      data: null,
      errors: [{ message: 'Unknown field "missionsCollection" on type Query' }],
    };
    expect(isCollectionHidden(res, "missionsCollection")).toBe(true);
    expect(edgeCount(res, "missionsCollection")).toBeNull();
  });

  it("detects an exposed collection that RLS filtered to zero rows", () => {
    const res = { data: { missionsCollection: { edges: [] } } };
    expect(isCollectionHidden(res, "missionsCollection")).toBe(false);
    expect(edgeCount(res, "missionsCollection")).toBe(0);
  });

  it("detects a leak", () => {
    const res = { data: { missionsCollection: { edges: [{ node: { nodeId: "x" } }] } } };
    expect(edgeCount(res, "missionsCollection")).toBe(1);
  });
});

describe("anon grant assertions (mocked transport)", () => {
  it("PASSes when every sensitive collection is hidden from anon", async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string };
      const collection = /\{ (\w+) \{/.exec(body.query)?.[1] ?? "";
      return {
        json: async () => ({
          data: null,
          errors: [{ message: `Unknown field "${collection}" on type Query` }],
        }),
      };
    }) as unknown as typeof fetch;
    const results = await verifyAnonGraphql("https://example.supabase.co", "anon", fetchImpl);
    expect(results).toHaveLength(ANON_FORBIDDEN_COLLECTIONS.length);
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("FAILs when anon receives rows", async () => {
    const fetchImpl = (async () => ({
      json: async () => ({ data: { profilesCollection: { edges: [{ node: { nodeId: "a" } }] } } }),
    })) as unknown as typeof fetch;
    const results = await verifyAnonGraphql("https://example.supabase.co", "anon", fetchImpl);
    expect(results[0].status).toBe("FAIL");
    expect(results[0].detail).toContain("LEAK");
  });
});

describe("authenticated RLS assertion (mocked transport)", () => {
  const me = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";

  it("PASSes when every row belongs to the caller", async () => {
    const fetchImpl = (async () => ({
      json: async () => ({
        data: {
          profilesCollection: { edges: [{ node: { id: me } }] },
          missionsCollection: { edges: [{ node: { id: "m1", user_id: me } }] },
        },
      }),
    })) as unknown as typeof fetch;
    const [r] = await verifyAuthenticatedGraphql("https://x", "anon", "tok", me, fetchImpl);
    expect(r.status).toBe("PASS");
  });

  it("FAILs when a foreign row is returned", async () => {
    const fetchImpl = (async () => ({
      json: async () => ({
        data: {
          profilesCollection: { edges: [{ node: { id: other } }] },
          missionsCollection: { edges: [] },
        },
      }),
    })) as unknown as typeof fetch;
    const [r] = await verifyAuthenticatedGraphql("https://x", "anon", "tok", me, fetchImpl);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toContain("RLS LEAK");
  });
});

describe("table grant assessment", () => {
  const ok: TableGrantRow[] = [
    {
      table_name: "missions",
      rls_enabled: true,
      policy_count: 4,
      anon_select: false,
      auth_select: true,
    },
  ];

  it("PASSes a correctly locked-down table", () => {
    expect(assessTableGrants(ok).status).toBe("PASS");
  });

  it("FAILs a table with anon SELECT", () => {
    const bad = [{ ...ok[0], anon_select: true }];
    expect(assessTableGrants(bad).status).toBe("FAIL");
  });

  it("FAILs a table without RLS", () => {
    const bad = [{ ...ok[0], rls_enabled: false }];
    expect(assessTableGrants(bad).status).toBe("FAIL");
  });

  it("FAILs a table with zero policies", () => {
    const bad = [{ ...ok[0], policy_count: 0 }];
    expect(assessTableGrants(bad).status).toBe("FAIL");
  });
});

// ---------------------------------------------------------------------------
// LIVE probes — real network calls against the project's GraphQL endpoint.
// ---------------------------------------------------------------------------
const liveAnon = baseUrl && anonKey ? describe : describe.skip;
liveAnon("LIVE: anon pg_graphql against the real project", () => {
  it("exposes no sensitive collection to the anon role", async () => {
    const results = await verifyAnonGraphql(baseUrl!, anonKey!);
    for (const r of results) {
      console.log(`[${r.status}] ${r.name} :: ${r.query} :: ${JSON.stringify(r.evidence)}`);
    }
    expect(results.filter((r) => r.status === "FAIL")).toEqual([]);
  }, 30_000);
});

const liveAuth = baseUrl && anonKey && e2eEmail && e2ePassword ? describe : describe.skip;
liveAuth("LIVE: authenticated pg_graphql against the real project", () => {
  it("returns only rows owned by the signed-in user", async (ctx) => {
    const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey!, "Content-Type": "application/json" },
      body: JSON.stringify({ email: e2eEmail, password: e2ePassword }),
    });
    const token = (await res.json()) as {
      access_token?: string;
      user?: { id: string };
      error_code?: string;
      msg?: string;
    };
    if (!token.access_token) {
      // Credentials are present but cannot mint a session against the live
      // project. Report NOT VERIFIED with the real blocker — never fabricate
      // authenticated GraphQL evidence by passing the assertion.
      console.warn(
        `[NOT VERIFIED] authenticated pg_graphql :: sign-in with E2E_TEST_USER_EMAIL failed ` +
          `(HTTP ${res.status}, ${token.error_code ?? "unknown"}: ${token.msg ?? "no detail"}). ` +
          `Blocker: the configured E2E test user does not exist or the password is wrong in this Supabase project.`,
      );
      ctx.skip();
      return;
    }

    const results = await verifyAuthenticatedGraphql(
      baseUrl!,
      anonKey!,
      token.access_token!,
      token.user!.id,
    );
    for (const r of results) {
      console.log(`[${r.status}] ${r.name} :: ${r.query} :: ${JSON.stringify(r.evidence)}`);
    }
    expect(results.filter((r) => r.status === "FAIL")).toEqual([]);
  }, 30_000);
});
