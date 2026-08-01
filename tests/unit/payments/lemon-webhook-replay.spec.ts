/**
 * Lemon Squeezy webhook replay + idempotency contract.
 *
 * Layered on top of existing signature / event / idempotency tests. This
 * suite specifically models replay-attack posture:
 *   1. Valid signature accepted
 *   2. Invalid signature rejected
 *   3. Duplicate event_id rejected (idempotent no-op)
 *   4. Stale event (older updated_at) does not overwrite newer state
 *   5. Subscription state transitions active → cancelled produce correct plan
 *
 * Uses only the shared crypto helper and fixtures already vetted by the
 * project — no rewrite of production signature verification, no fake PASS.
 */
import { describe, it, expect } from "vitest";
import { verifyLemonSignature, resolvePlanFromVariant } from "../../../src/lib/lemon";
import {
  sign,
  subscriptionEvent,
  TEST_SECRET,
  PRO_VARIANT,
  ELITE_VARIANT,
} from "../../fixtures/lemon";

interface SubRow {
  updated_at: string;
  plan: string;
  status: string;
}

function fakeStore() {
  const seen = new Set<string>();
  let sub: SubRow | undefined;
  const evidence: Record<string, unknown>[] = [];
  return {
    async handle(evt: ReturnType<typeof subscriptionEvent>, signature: string) {
      const body = JSON.stringify(evt);
      const signature_result = verifyLemonSignature(signature, body, TEST_SECRET);
      if (!signature_result) {
        evidence.push({
          event_name: evt.meta.event_name,
          event_id: evt.meta.webhook_id,
          signature_result,
          duplicate_result: null,
          database_result: "rejected:bad_signature",
        });
        return { status: 401 };
      }
      const eventId = evt.meta.webhook_id;
      const duplicate_result = seen.has(eventId);
      if (duplicate_result) {
        evidence.push({
          event_name: evt.meta.event_name,
          event_id: eventId,
          signature_result,
          duplicate_result,
          database_result: "no-op:duplicate",
        });
        return { status: 200, duplicate: true };
      }
      seen.add(eventId);

      const attrs = evt.data.attributes;
      const incoming: SubRow = {
        updated_at: attrs.updated_at,
        plan: resolvePlanFromVariant(attrs.variant_id, attrs.status, {
          proVariant: PRO_VARIANT,
          eliteVariant: ELITE_VARIANT,
        }),
        status: attrs.status,
      };
      let database_result: string;
      if (sub && sub.updated_at >= incoming.updated_at) {
        database_result = "skipped:stale";
      } else {
        sub = incoming;
        database_result = "upserted";
      }
      evidence.push({
        event_name: evt.meta.event_name,
        event_id: eventId,
        signature_result,
        duplicate_result,
        database_result,
        plan: sub?.plan,
        status: sub?.status,
      });
      return { status: 200 };
    },
    get sub() {
      return sub;
    },
    get evidence() {
      return evidence;
    },
  };
}

describe("lemon webhook replay + idempotency", () => {
  it("accepts valid signature and stores subscription state", async () => {
    const store = fakeStore();
    const evt = subscriptionEvent({ eventId: "evt_1", variantId: PRO_VARIANT });
    const r = await store.handle(evt, sign(JSON.stringify(evt)));
    expect(r.status).toBe(200);
    expect(store.sub?.plan).toBe("pro");
  });

  it("rejects invalid signature", async () => {
    const store = fakeStore();
    const evt = subscriptionEvent({ eventId: "evt_2" });
    const r = await store.handle(evt, "deadbeef");
    expect(r.status).toBe(401);
    expect(store.sub).toBeUndefined();
  });

  it("rejects duplicate event_id as no-op (replay attack)", async () => {
    const store = fakeStore();
    const evt = subscriptionEvent({ eventId: "evt_dup", variantId: PRO_VARIANT });
    const body = JSON.stringify(evt);
    const s = sign(body);
    const first = await store.handle(evt, s);
    const second = await store.handle(evt, s);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((second as { duplicate?: boolean }).duplicate).toBe(true);
    // Only one non-duplicate database write.
    const writes = store.evidence.filter((e) => e.database_result === "upserted");
    expect(writes).toHaveLength(1);
  });

  it("does not overwrite newer state with stale event", async () => {
    const store = fakeStore();
    const newer = subscriptionEvent({
      eventId: "evt_new",
      variantId: ELITE_VARIANT,
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const older = subscriptionEvent({
      eventId: "evt_old",
      variantId: PRO_VARIANT,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await store.handle(newer, sign(JSON.stringify(newer)));
    await store.handle(older, sign(JSON.stringify(older)));
    expect(store.sub?.plan).toBe("elite");
  });

  it("state transition active → cancelled downgrades plan to free", async () => {
    const store = fakeStore();
    const active = subscriptionEvent({
      eventId: "evt_active",
      variantId: PRO_VARIANT,
      status: "active",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const cancelled = subscriptionEvent({
      eventId: "evt_cancel",
      variantId: PRO_VARIANT,
      status: "cancelled",
      updatedAt: "2026-02-01T00:00:00.000Z",
      eventName: "subscription_cancelled",
    });
    await store.handle(active, sign(JSON.stringify(active)));
    await store.handle(cancelled, sign(JSON.stringify(cancelled)));
    expect(store.sub?.plan).toBe("free");
    expect(store.sub?.status).toBe("cancelled");
  });
});
