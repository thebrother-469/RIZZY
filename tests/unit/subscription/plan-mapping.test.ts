import { describe, it, expect } from "vitest";
import { resolvePlanFromVariant, isSubscriptionActive } from "../../../src/lib/lemon";
import { PRO_VARIANT, ELITE_VARIANT } from "../../fixtures/lemon";

const V = { proVariant: PRO_VARIANT, eliteVariant: ELITE_VARIANT };

describe("resolvePlanFromVariant", () => {
  it("maps active pro variant → pro", () => {
    expect(resolvePlanFromVariant(PRO_VARIANT, "active", V)).toBe("pro");
  });

  it("maps active elite variant → elite", () => {
    expect(resolvePlanFromVariant(ELITE_VARIANT, "active", V)).toBe("elite");
  });

  it("maps on_trial / past_due / paused pro → pro (still entitled)", () => {
    for (const s of ["on_trial", "past_due", "paused"]) {
      expect(resolvePlanFromVariant(PRO_VARIANT, s, V)).toBe("pro");
    }
  });

  it("maps cancelled / expired / unpaid → free", () => {
    for (const s of ["cancelled", "expired", "unpaid", ""]) {
      expect(resolvePlanFromVariant(PRO_VARIANT, s, V)).toBe("free");
      expect(resolvePlanFromVariant(ELITE_VARIANT, s, V)).toBe("free");
    }
  });

  it("unknown variant on active status → free (no accidental privilege escalation)", () => {
    expect(resolvePlanFromVariant("999999", "active", V)).toBe("free");
  });

  it("empty variant on active status → free", () => {
    expect(resolvePlanFromVariant("", "active", V)).toBe("free");
    expect(resolvePlanFromVariant(null, "active", V)).toBe("free");
  });

  it("handles numeric variant ids by coercion", () => {
    expect(resolvePlanFromVariant(Number(PRO_VARIANT), "active", V)).toBe("pro");
  });

  it("upgrade: pro → elite yields elite", () => {
    const before = resolvePlanFromVariant(PRO_VARIANT, "active", V);
    const after = resolvePlanFromVariant(ELITE_VARIANT, "active", V);
    expect(before).toBe("pro");
    expect(after).toBe("elite");
  });

  it("downgrade: elite → pro yields pro", () => {
    expect(resolvePlanFromVariant(ELITE_VARIANT, "active", V)).toBe("elite");
    expect(resolvePlanFromVariant(PRO_VARIANT, "active", V)).toBe("pro");
  });

  it("cancellation: active pro → cancelled pro yields free", () => {
    expect(resolvePlanFromVariant(PRO_VARIANT, "active", V)).toBe("pro");
    expect(resolvePlanFromVariant(PRO_VARIANT, "cancelled", V)).toBe("free");
  });

  it("reactivation: expired → active pro yields pro", () => {
    expect(resolvePlanFromVariant(PRO_VARIANT, "expired", V)).toBe("free");
    expect(resolvePlanFromVariant(PRO_VARIANT, "active", V)).toBe("pro");
  });
});

describe("isSubscriptionActive", () => {
  it("treats lifecycle-active statuses as active", () => {
    for (const s of ["active", "on_trial", "past_due", "paused"]) {
      expect(isSubscriptionActive(s)).toBe(true);
    }
  });
  it("treats terminal statuses as inactive", () => {
    for (const s of ["cancelled", "expired", "unpaid", "", null, undefined]) {
      expect(isSubscriptionActive(s)).toBe(false);
    }
  });
});
