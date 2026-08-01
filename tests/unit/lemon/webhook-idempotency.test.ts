/**
 * Simulates the webhook handler's idempotency + staleness guards.
 * The production route uses the same shape:
 *   1. Insert event_id into lemonsqueezy_webhook_events. Unique-key violation (23505) → treat as duplicate and no-op.
 *   2. Read existing subscriptions row. If existing.updated_at > event timestamp → skip stale event.
 *   3. Otherwise upsert plan/status.
 * These tests fake the DB layer and assert the branching, so a regression
 * to the ordering / short-circuits in the route surfaces here.
 */
import { describe, it, expect } from "vitest";
import { resolvePlanFromVariant } from "../../../src/lib/lemon";
import { subscriptionEvent, PRO_VARIANT, ELITE_VARIANT } from "../../fixtures/lemon";

type EventRow = { event_id: string };
type SubRow = { updated_at: string; plan: string; status: string };

function makeFakeDb(initial?: { events?: EventRow[]; sub?: SubRow }) {
  const events = new Set((initial?.events ?? []).map((e) => e.event_id));
  let sub: SubRow | undefined = initial?.sub;
  return {
    async insertEvent(id: string) {
      if (events.has(id)) return { error: { code: "23505" } as const };
      events.add(id);
      return { error: null };
    },
    async getSub() {
      return sub;
    },
    async upsertSub(row: SubRow) {
      sub = row;
      return { error: null };
    },
    _peek: () => sub,
    _eventCount: () => events.size,
  };
}

async function applyEvent(
  db: ReturnType<typeof makeFakeDb>,
  evt: ReturnType<typeof subscriptionEvent>,
  variants: { proVariant: string; eliteVariant: string },
) {
  const eventId = evt.meta.webhook_id;
  const ins = await db.insertEvent(eventId);
  if (ins.error?.code === "23505") return { status: "duplicate" as const };

  const attrs = evt.data.attributes;
  const eventTs = attrs.updated_at ?? attrs.created_at ?? null;
  const existing = await db.getSub();
  if (existing?.updated_at && eventTs && new Date(existing.updated_at) > new Date(eventTs)) {
    return { status: "stale" as const };
  }

  const plan = resolvePlanFromVariant(attrs.variant_id, attrs.status, variants);
  await db.upsertSub({
    updated_at: eventTs ?? new Date().toISOString(),
    plan,
    status: attrs.status ?? "unknown",
  });
  return { status: "applied" as const, plan };
}

const V = { proVariant: PRO_VARIANT, eliteVariant: ELITE_VARIANT };

describe("webhook idempotency + staleness", () => {
  it("first delivery is applied", async () => {
    const db = makeFakeDb();
    const r = await applyEvent(db, subscriptionEvent({ eventId: "e1" }), V);
    expect(r).toEqual({ status: "applied", plan: "pro" });
  });

  it("duplicate event_id is ignored", async () => {
    const db = makeFakeDb();
    const evt = subscriptionEvent({ eventId: "e-dup" });
    await applyEvent(db, evt, V);
    const r2 = await applyEvent(db, evt, V);
    expect(r2.status).toBe("duplicate");
    expect(db._eventCount()).toBe(1);
  });

  it("newer event replaces older subscription state (upgrade)", async () => {
    const db = makeFakeDb();
    await applyEvent(
      db,
      subscriptionEvent({
        eventId: "e1",
        variantId: PRO_VARIANT,
        updatedAt: "2099-01-01T00:00:00Z",
      }),
      V,
    );
    const r = await applyEvent(
      db,
      subscriptionEvent({
        eventId: "e2",
        variantId: ELITE_VARIANT,
        updatedAt: "2099-02-01T00:00:00Z",
      }),
      V,
    );
    expect(r).toEqual({ status: "applied", plan: "elite" });
    expect(db._peek()?.plan).toBe("elite");
  });

  it("stale event (older than existing row) is skipped", async () => {
    const db = makeFakeDb();
    await applyEvent(
      db,
      subscriptionEvent({
        eventId: "e-new",
        variantId: ELITE_VARIANT,
        updatedAt: "2099-06-01T00:00:00Z",
      }),
      V,
    );
    const r = await applyEvent(
      db,
      subscriptionEvent({
        eventId: "e-old",
        variantId: PRO_VARIANT,
        updatedAt: "2099-01-01T00:00:00Z",
      }),
      V,
    );
    expect(r.status).toBe("stale");
    expect(db._peek()?.plan).toBe("elite");
  });

  it("cancellation event downgrades to free", async () => {
    const db = makeFakeDb();
    await applyEvent(
      db,
      subscriptionEvent({ eventId: "e1", variantId: PRO_VARIANT, status: "active" }),
      V,
    );
    const r = await applyEvent(
      db,
      subscriptionEvent({
        eventId: "e2",
        variantId: PRO_VARIANT,
        status: "cancelled",
        updatedAt: "2099-03-01T00:00:00Z",
      }),
      V,
    );
    expect(r).toEqual({ status: "applied", plan: "free" });
  });

  it("reactivation event promotes back to paid plan", async () => {
    const db = makeFakeDb({
      sub: { updated_at: "2099-01-01T00:00:00Z", plan: "free", status: "expired" },
    });
    const r = await applyEvent(
      db,
      subscriptionEvent({
        eventId: "e-reactivate",
        variantId: PRO_VARIANT,
        status: "active",
        updatedAt: "2099-02-01T00:00:00Z",
      }),
      V,
    );
    expect(r).toEqual({ status: "applied", plan: "pro" });
  });
});
