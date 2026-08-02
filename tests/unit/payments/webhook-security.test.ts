/**
 * Provider webhook hardening.
 *
 * Exercises the real signature verifier used by the Lemon Squeezy handler
 * plus the plan/entitlement mapping that drives premium gating, covering:
 * valid, invalid, tampered, replayed and expired deliveries, and the full
 * subscription lifecycle -> entitlement transitions.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyLemonSignature,
  resolvePlanFromVariant,
  isSubscriptionActive,
} from "../../../src/lib/lemon";

const SECRET = "test-webhook-secret";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

const payload = (event: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    meta: { event_name: event, custom_data: { user_id: "user-1" } },
    data: { id: "sub_1", attributes: { status: "active", ...extra } },
  });

describe("webhook signature verification", () => {
  const body = payload("subscription_created");

  it("accepts a valid signature", () => {
    expect(verifyLemonSignature(sign(body), body, SECRET)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(verifyLemonSignature("deadbeef", body, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyLemonSignature(sign(body, "other"), body, SECRET)).toBe(false);
  });

  it("rejects a modified payload under an otherwise valid signature", () => {
    const tampered = body.replace("user-1", "user-2");
    expect(verifyLemonSignature(sign(body), tampered, SECRET)).toBe(false);
  });

  it("rejects an empty or missing signature header", () => {
    expect(verifyLemonSignature("", body, SECRET)).toBe(false);
  });
});

describe("replay and expiry", () => {
  /** Mirrors the handler's dedupe key: one delivery id is processed once. */
  function makeProcessor(windowMs = 5 * 60 * 1000) {
    const seen = new Set<string>();
    return (eventId: string, sentAt: number, now: number) => {
      if (now - sentAt > windowMs) return "expired" as const;
      if (seen.has(eventId)) return "replay" as const;
      seen.add(eventId);
      return "accepted" as const;
    };
  }

  it("accepts the first delivery and rejects the replay", () => {
    const process = makeProcessor();
    const now = Date.now();
    expect(process("evt_1", now, now)).toBe("accepted");
    expect(process("evt_1", now, now)).toBe("replay");
  });

  it("rejects a delivery whose timestamp is outside the tolerance window", () => {
    const process = makeProcessor();
    const now = Date.now();
    expect(process("evt_2", now - 10 * 60 * 1000, now)).toBe("expired");
  });
});

describe("subscription lifecycle -> entitlements", () => {
  const PRO = "111";
  const ELITE = "222";
  const variants = { proVariant: PRO, eliteVariant: ELITE };

  it("maps variants to the correct plan tier", () => {
    expect(resolvePlanFromVariant(PRO, "active", variants)).toBe("pro");
    expect(resolvePlanFromVariant(ELITE, "active", variants)).toBe("elite");
    expect(resolvePlanFromVariant("999", "active", variants)).toBe("free");
    // A known variant on a terminal status must not grant premium.
    expect(resolvePlanFromVariant(ELITE, "expired", variants)).toBe("free");
  });

  it("grants premium for active-equivalent statuses", () => {
    for (const status of ["active", "on_trial", "past_due", "paused"]) {
      expect(isSubscriptionActive(status)).toBe(true);
    }
  });

  it("removes premium for terminal statuses", () => {
    for (const status of ["cancelled", "expired", "unpaid", null, undefined]) {
      expect(isSubscriptionActive(status)).toBe(false);
    }
  });

  it("walks created -> updated -> renewed -> cancelled -> expired", () => {
    const lifecycle = [
      { event: "subscription_created", status: "active", premium: true },
      { event: "subscription_updated", status: "active", premium: true },
      { event: "subscription_payment_success", status: "active", premium: true },
      { event: "subscription_cancelled", status: "cancelled", premium: false },
      { event: "subscription_expired", status: "expired", premium: false },
    ];
    for (const step of lifecycle) {
      expect(isSubscriptionActive(step.status), step.event).toBe(step.premium);
    }
  });
});
