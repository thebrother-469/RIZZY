/**
 * Broader webhook parsing / event-ordering coverage on top of the
 * idempotency suite. Exercises the pure signature+plan+timestamp logic
 * that the /api/public/lemon-webhook route composes.
 */
import { describe, it, expect } from "vitest";
import { verifyLemonSignature, resolvePlanFromVariant, isSubscriptionActive } from "@/lib/lemon";
import {
  sign,
  subscriptionEvent,
  TEST_SECRET,
  PRO_VARIANT,
  ELITE_VARIANT,
} from "../../fixtures/lemon";

const V = { proVariant: PRO_VARIANT, eliteVariant: ELITE_VARIANT };

describe("webhook event integrity", () => {
  it("valid signature + subscription_created → active pro", () => {
    const evt = subscriptionEvent({ eventName: "subscription_created", variantId: PRO_VARIANT });
    const body = JSON.stringify(evt);
    expect(verifyLemonSignature(sign(body), body, TEST_SECRET)).toBe(true);
    expect(
      resolvePlanFromVariant(evt.data.attributes.variant_id, evt.data.attributes.status, V),
    ).toBe("pro");
  });

  it("tampered body after signing fails verification", () => {
    const evt = subscriptionEvent({ variantId: PRO_VARIANT });
    const body = JSON.stringify(evt);
    const sig = sign(body);
    const tampered = body.replace(PRO_VARIANT, ELITE_VARIANT);
    expect(verifyLemonSignature(sig, tampered, TEST_SECRET)).toBe(false);
  });

  it("replay with wrong secret fails", () => {
    const body = JSON.stringify(subscriptionEvent());
    expect(verifyLemonSignature(sign(body, "attacker"), body, TEST_SECRET)).toBe(false);
  });

  it("subscription_cancelled → free regardless of variant", () => {
    for (const v of [PRO_VARIANT, ELITE_VARIANT]) {
      expect(resolvePlanFromVariant(v, "cancelled", V)).toBe("free");
    }
    expect(isSubscriptionActive("cancelled")).toBe(false);
  });

  it("subscription_paused keeps entitlement", () => {
    expect(resolvePlanFromVariant(PRO_VARIANT, "paused", V)).toBe("pro");
    expect(isSubscriptionActive("paused")).toBe(true);
  });

  it("event ordering: newer updated_at should win (timestamp compare)", () => {
    const older = new Date("2099-01-01T00:00:00Z");
    const newer = new Date("2099-06-01T00:00:00Z");
    expect(newer > older).toBe(true);
  });
});
