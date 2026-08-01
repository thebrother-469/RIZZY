import { describe, it, expect } from "vitest";
import { resolveTitle, greeting, sentence } from "@/lib/title";

const onboarded = "2026-01-01T00:00:00.000Z";

describe("personalized titles", () => {
  it("uses King only for a self-declared male, onboarded profile", () => {
    expect(resolveTitle({ gender: "male", onboarded_at: onboarded })).toEqual({
      title: "King",
      lower: "king",
    });
  });

  it("uses Queen for a self-declared female profile", () => {
    expect(resolveTitle({ gender: "female", onboarded_at: onboarded }).title).toBe("Queen");
  });

  it("falls back to neutral for every untrusted or undeclared signal", () => {
    for (const p of [
      null,
      {},
      { gender: "male" }, // not onboarded => untrusted
      { gender: null, onboarded_at: onboarded },
      { gender: "", onboarded_at: onboarded },
      { gender: "nonbinary", onboarded_at: onboarded },
      { gender: "prefer_not_to_say", onboarded_at: onboarded },
      { gender: "Kingsley", onboarded_at: onboarded },
    ]) {
      expect(resolveTitle(p)).toEqual({ title: null, lower: null });
    }
  });

  it("renders neutral copy that never leaks a gendered word", () => {
    expect(greeting("Welcome back", null)).toBe("Welcome back");
    expect(sentence("Let's go", null)).toBe("Let's go.");
    expect(greeting("Welcome back", { gender: "female", onboarded_at: onboarded })).toBe(
      "Welcome back, queen",
    );
    expect(sentence("Let's go", { gender: "male", onboarded_at: onboarded })).toBe(
      "Let's go, king.",
    );
  });
});
