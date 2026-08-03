/**
 * pg_graphql exposure audit — contract tests + LIVE probes.
 *
 * The classification logic is always tested deterministically. The LIVE
 * describe blocks execute real GraphQL against the connected project and
 * write security-artifacts/graphql-exposure.json; they are skipped loudly
 * (never faked) when credentials are not bound to the runtime.
 */
import { describe, it, expect } from "vitest";
import {
  ANON_FORBIDDEN_TABLES,
  AUTHENTICATED_ALLOWLIST,
  SERVICE_ONLY_TABLES,
  acquireAuditSession,
  releaseAuditSession,
  auditAnon,
  auditAuthenticated,
  buildArtifact,
  classify,
  collectionName,
  edgeCount,
  isHidden,
  writeArtifact,
} from "../../scripts/verify-graphql";
import { resolveEnv } from "../../scripts/e2e-env";

const e = resolveEnv();

const hiddenResponse = (collection: string) => ({
  data: null,
  errors: [{ message: `Unknown field "${collection}" on type Query` }],
});

describe("allowlist integrity", () => {
  it("never allows a service-only table into the authenticated allowlist", () => {
    const overlap = AUTHENTICATED_ALLOWLIST.filter((t) =>
      (SERVICE_ONLY_TABLES as readonly string[]).includes(t),
    );
    expect(overlap).toEqual([]);
  });

  it("forbids every known table for the anon role", () => {
    for (const t of [...AUTHENTICATED_ALLOWLIST, ...SERVICE_ONLY_TABLES]) {
      expect(ANON_FORBIDDEN_TABLES).toContain(t);
    }
  });
});

describe("response classification", () => {
  it("detects a hidden collection", () => {
    const res = hiddenResponse("missionsCollection");
    expect(isHidden(res, "missionsCollection")).toBe(true);
    expect(edgeCount(res, "missionsCollection")).toBeNull();
  });

  it("PASSes anon when the collection is hidden", () => {
    const c = classify("anon", "missions", "hidden", hiddenResponse("missionsCollection"), "q");
    expect(c.status).toBe("PASS");
    expect(c.observed).toBe("hidden");
  });

  it("FAILs anon when rows come back", () => {
    const res = { data: { profilesCollection: { edges: [{ node: { nodeId: "a" } }] } } };
    const c = classify("anon", "profiles", "hidden", res, "q");
    expect(c.status).toBe("FAIL");
    expect(c.detail).toContain("EXPOSURE REGRESSION");
  });

  it("FAILs authenticated when a service-only collection becomes queryable", () => {
    const res = {
      data: { lemonsqueezy_webhook_eventsCollection: { edges: [{ node: { nodeId: "x" } }] } },
    };
    const c = classify("authenticated", "lemonsqueezy_webhook_events", "hidden", res, "q");
    expect(c.status).toBe("FAIL");
  });

  it("PASSes an owner-scoped collection with only own rows", () => {
    const res = { data: { missionsCollection: { edges: [{ node: { user_id: "me" } }] } } };
    const c = classify("authenticated", "missions", "owner_scoped", res, "q", 0);
    expect(c.status).toBe("PASS");
  });

  it("FAILs an owner-scoped collection that leaks a foreign row", () => {
    const res = { data: { missionsCollection: { edges: [{ node: { user_id: "other" } }] } } };
    const c = classify("authenticated", "missions", "owner_scoped", res, "q", 1);
    expect(c.status).toBe("FAIL");
    expect(c.detail).toContain("RLS LEAK");
  });

  it("FAILs when an allowlisted collection disappears entirely", () => {
    const c = classify(
      "authenticated",
      "missions",
      "owner_scoped",
      hiddenResponse("missionsCollection"),
      "q",
    );
    expect(c.status).toBe("FAIL");
  });
});

describe("artifact shape", () => {
  it("is machine-readable and reflects failures", () => {
    const failing = classify(
      "anon",
      "profiles",
      "hidden",
      {
        data: { profilesCollection: { edges: [{ node: { nodeId: "a" } }] } },
      },
      "q",
    );
    const artifact = buildArtifact([failing], [], "proj", new Date("2026-01-01T00:00:00Z"));
    expect(artifact.status).toBe("FAIL");
    expect(artifact.summary).toEqual({ pass: 0, fail: 1, notVerified: 0 });
    expect(artifact.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(JSON.parse(JSON.stringify(artifact)).checks[0].collection).toBe("profilesCollection");
  });

  it("carries anon/authenticated splits, the denylist and unexpected exposures", () => {
    const leaked = classify(
      "anon",
      "profiles",
      "hidden",
      {
        data: { profilesCollection: { edges: [{ node: { nodeId: "a" } }] } },
      },
      "q",
    );
    const owned = classify(
      "authenticated",
      "missions",
      "owner_scoped",
      { data: { missionsCollection: { edges: [{ node: { user_id: "me" } }] } } },
      "q",
      0,
    );
    const artifact = buildArtifact([leaked, owned], [], "proj");
    expect(artifact.anon).toHaveLength(1);
    expect(artifact.authenticated).toHaveLength(1);
    expect(artifact.denylist.anon).toEqual([...ANON_FORBIDDEN_TABLES]);
    expect(artifact.denylist.authenticated).toEqual([...SERVICE_ONLY_TABLES]);
    expect(artifact.unexpectedExposures.map((c) => c.table)).toEqual(["profiles"]);
    expect(artifact.status).toBe("FAIL");
  });
});

describe("mocked transport end-to-end", () => {
  it("PASSes a fully locked-down anon surface", async () => {
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string };
      const collection = /\{ (\w+)\(/.exec(body.query)?.[1] ?? "";
      return { json: async () => hiddenResponse(collection) };
    }) as unknown as typeof fetch;
    const results = await auditAnon("https://example.supabase.co", "anon", fetchImpl);
    expect(results).toHaveLength(ANON_FORBIDDEN_TABLES.length);
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("PASSes an authenticated surface that matches the allowlist exactly", async () => {
    const me = "11111111-1111-1111-1111-111111111111";
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string };
      const collection = /\{ (\w+)\(/.exec(body.query)?.[1] ?? "";
      const table = collection.replace(/Collection$/, "");
      if ((SERVICE_ONLY_TABLES as readonly string[]).includes(table)) {
        return { json: async () => hiddenResponse(collection) };
      }
      const owner = table === "profiles" ? "id" : "user_id";
      return {
        json: async () => ({
          data: { [collection]: { edges: [{ node: { nodeId: "n", [owner]: me } }] } },
        }),
      };
    }) as unknown as typeof fetch;
    const results = await auditAuthenticated("https://x", "anon", "tok", me, fetchImpl);
    expect(results).toHaveLength(AUTHENTICATED_ALLOWLIST.length + SERVICE_ONLY_TABLES.length);
    expect(results.filter((r) => r.status === "FAIL")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LIVE probes against the connected Supabase project.
// ---------------------------------------------------------------------------
const liveAnon = e.url && e.anonKey ? describe : describe.skip;
liveAnon("LIVE: anon exposure", () => {
  it("exposes nothing to the anonymous role", async () => {
    const checks = await auditAnon(e.url!, e.anonKey!);
    for (const c of checks) console.log(`[${c.status}] anon ${c.collection} — ${c.detail}`);
    writeArtifact(buildArtifact(checks, [], e.url!.match(/\/\/([^.]+)\./)?.[1] ?? null));
    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
  }, 60_000);
});

const liveAuth =
  e.url && e.anonKey && (e.serviceKey || (e.email && e.password)) ? describe : describe.skip;
liveAuth("LIVE: authenticated exposure", () => {
  it("matches the authenticated allowlist and hides every service-only table", async (ctx) => {
    const acquired = await acquireAuditSession(e);
    if (!acquired.session) {
      console.warn(
        `[NOT VERIFIED] authenticated pg_graphql audit :: ${acquired.reason ?? "no session"}`,
      );
      ctx.skip();
      return;
    }
    let checks;
    try {
      checks = await auditAuthenticated(
        e.url!,
        e.anonKey!,
        acquired.session.access_token,
        acquired.session.user.id,
      );
    } finally {
      await releaseAuditSession(acquired, e);
    }
    for (const c of checks) {
      console.log(`[${c.status}] authenticated ${c.collection} — ${c.detail}`);
    }
    // Nothing outside the union of allowlist + service-only may be reachable.
    const known = new Set<string>([...AUTHENTICATED_ALLOWLIST, ...SERVICE_ONLY_TABLES]);
    for (const c of checks) expect(known.has(c.table), `${c.table} not declared`).toBe(true);
    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(collectionName("missions")).toBe("missionsCollection");

    // Both halves land in one artifact so CI uploads a complete record.
    const anon = await auditAnon(e.url!, e.anonKey!);
    writeArtifact(
      buildArtifact([...anon, ...checks], [], e.url!.match(/\/\/([^.]+)\./)?.[1] ?? null),
    );
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Phase 3 — ROW-LEVEL isolation (auth.uid() scoping) contract + LIVE probes.
// ---------------------------------------------------------------------------
import {
  ROW_SCOPE_TABLES,
  auditRowScope,
  acquireTwoActors,
  releaseActors,
  buildRowScopeArtifact,
  collectOwners,
  evaluateScope,
  scopeQuery,
  writeRowScopeArtifact,
} from "../../scripts/verify-graphql-row-scope";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("row-scope probe construction", () => {
  it("covers every allowlisted owner-scoped table", () => {
    expect([...ROW_SCOPE_TABLES].sort()).toEqual([...AUTHENTICATED_ALLOWLIST].sort());
  });

  it("builds nested, paginated and ordered probes", () => {
    expect(scopeQuery("chats", "nested")).toContain("messagesCollection");
    expect(scopeQuery("missions", "pagination")).toContain("first: 50");
    expect(scopeQuery("missions", "ordering")).toContain("orderBy");
    expect(scopeQuery("profiles", "plain")).toContain("id");
  });

  it("collects owner ids recursively through nested relations", () => {
    const res = {
      data: {
        chatsCollection: {
          edges: [
            { node: { user_id: A, messagesCollection: { edges: [{ node: { user_id: B } }] } } },
          ],
        },
      },
    };
    expect(collectOwners(res.data, "user_id").sort()).toEqual([A, B].sort());
  });
});

describe("row-scope classification", () => {
  const own = { data: { missionsCollection: { edges: [{ node: { user_id: A } }] } } };
  const leaked = {
    data: { missionsCollection: { edges: [{ node: { user_id: A } }, { node: { user_id: B } }] } },
  };

  it("PASSes when every row belongs to the caller", () => {
    const c = evaluateScope("userA", A, "missions", "plain", own, "q");
    expect(c.status).toBe("PASS");
    expect(c.foreignRows).toBe(0);
  });

  it("FAILs on any foreign row", () => {
    const c = evaluateScope("userA", A, "missions", "pagination", leaked, "q");
    expect(c.status).toBe("FAIL");
    expect(c.detail).toContain("RLS LEAK");
  });

  it("FAILs on a nested relation leak", () => {
    const nested = {
      data: {
        chatsCollection: {
          edges: [
            { node: { user_id: A, messagesCollection: { edges: [{ node: { user_id: B } }] } } },
          ],
        },
      },
    };
    expect(evaluateScope("userA", A, "chats", "nested", nested, "q").status).toBe("FAIL");
  });

  it("reports NOT_VERIFIED when the probe itself errored", () => {
    const c = evaluateScope("userA", A, "missions", "plain", { errors: [{ message: "boom" }] }, "q");
    expect(c.status).toBe("NOT_VERIFIED");
  });

  it("builds a machine-readable artifact that surfaces leaks", () => {
    const good = evaluateScope("userA", A, "missions", "plain", own, "q");
    const bad = evaluateScope("userB", B, "missions", "plain", leaked, "q");
    const artifact = buildRowScopeArtifact([], [good, bad], [], "proj", new Date("2026-01-01Z"));
    expect(artifact.status).toBe("FAIL");
    expect(artifact.leaks).toHaveLength(1);
    expect(artifact.actors).toEqual(["userA", "userB"]);
    expect(artifact.summary).toEqual({ pass: 1, fail: 1, notVerified: 0 });
  });
});

describe("row-scope mocked transport", () => {
  it("PASSes a fully isolated surface for both users", async () => {
    const forUser = (uid: string) =>
      (async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { query: string };
        const collection = /\{ (\w+)\(/.exec(body.query)?.[1] ?? "";
        return {
          json: async () => ({ data: { [collection]: { edges: [{ node: { user_id: uid, id: uid } }] } } }),
        };
      }) as unknown as typeof fetch;

    for (const uid of [A, B]) {
      const checks = await auditRowScope("https://x", "anon", "u", "tok", uid, forUser(uid));
      expect(checks).toHaveLength(ROW_SCOPE_TABLES.length * 4);
      expect(checks.filter((c) => c.status !== "PASS")).toEqual([]);
    }
  });
});

const liveScope =
  e.url && e.anonKey && (e.serviceKey || (e.email && e.password)) ? describe : describe.skip;
liveScope("LIVE: auth.uid() row isolation", () => {
  it("never returns a foreign row to either identity", async (ctx) => {
    const { actors, reason } = await acquireTwoActors(e);
    if (actors.length === 0) {
      console.warn(`[NOT VERIFIED] row-scope audit :: ${reason}`);
      ctx.skip();
      return;
    }
    const scope = [];
    try {
      for (const a of actors) {
        scope.push(
          ...(await auditRowScope(
            e.url!,
            e.anonKey!,
            a.name,
            a.session.access_token,
            a.session.user.id,
          )),
        );
      }
    } finally {
      await releaseActors(actors, e);
    }
    const anon = await auditAnon(e.url!, e.anonKey!);
    writeRowScopeArtifact(
      buildRowScopeArtifact(
        anon,
        scope,
        reason ? [reason] : [],
        e.url!.match(/\/\/([^.]+)\./)?.[1] ?? null,
      ),
    );
    expect(anon.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(scope.filter((c) => c.status === "FAIL")).toEqual([]);
  }, 120_000);
});
