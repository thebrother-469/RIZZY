import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveTitle,
  greeting,
  sentence,
  salutation,
  NEUTRAL_SALUTATION,
} from "@/lib/title";

const onboarded = "2026-01-01T00:00:00.000Z";

describe("personalized titles", () => {
  it("defaults to the neutral Champion salutation", () => {
    expect(NEUTRAL_SALUTATION).toBe("Champion");
    expect(salutation(null)).toBe("Champion");
    expect(greeting("Welcome back", null)).toBe("Welcome back, champion");
    expect(sentence("Let's go", null)).toBe("Let's go, champion.");
  });

  it("uses King/Queen only from an explicit stored preference", () => {
    expect(resolveTitle({ preferred_title: "king" }).title).toBe("King");
    expect(resolveTitle({ preferred_title: "queen" }).title).toBe("Queen");
    expect(resolveTitle({ preferred_title: "neutral" }).title).toBeNull();
    expect(greeting("Welcome back", { preferred_title: "queen" })).toBe("Welcome back, queen");
    expect(sentence("Let's go", { preferred_title: "king" })).toBe("Let's go, king.");
  });

  it("honours the legacy self-declared value on an onboarded profile", () => {
    expect(resolveTitle({ gender: "male", onboarded_at: onboarded }).title).toBe("King");
    expect(resolveTitle({ gender: "female", onboarded_at: onboarded }).title).toBe("Queen");
  });

  it("prefers the explicit preference over any legacy value", () => {
    expect(
      resolveTitle({ preferred_title: "queen", gender: "male", onboarded_at: onboarded }).title,
    ).toBe("Queen");
    expect(
      resolveTitle({ preferred_title: "neutral", gender: "male", onboarded_at: onboarded }).title,
    ).toBeNull();
  });

  it("never infers a title from an untrusted or absent signal", () => {
    for (const p of [
      null,
      {},
      { gender: "male" }, // legacy value, not onboarded => untrusted
      { gender: null, onboarded_at: onboarded },
      { gender: "", onboarded_at: onboarded },
      { gender: "nonbinary", onboarded_at: onboarded },
      { gender: "prefer_not_to_say", onboarded_at: onboarded },
      { gender: "Kingsley", onboarded_at: onboarded },
      { preferred_title: "", gender: null, onboarded_at: onboarded },
      { preferred_title: "Queenie", onboarded_at: onboarded },
    ]) {
      const r = resolveTitle(p);
      expect(r.title).toBeNull();
      expect(r.lower).toBeNull();
      expect(r.salutation).toBe("Champion");
    }
  });
});

/**
 * Consistency contract: no route may hardcode a gendered salutation. Every
 * surface must resolve it through the single `useUserTitle` hook so a stored
 * preference propagates identically everywhere and survives a refresh.
 */
describe("salutation consistency across routes", () => {
  const routesDir = join(process.cwd(), "src/routes");
  const files = readdirSync(routesDir, { recursive: true, encoding: "utf8" }).filter(
    (f) => typeof f === "string" && /\.tsx$/.test(f),
  ) as string[];

  it("finds route files to inspect", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const f of files) {
    it(`${f} never hardcodes King/Queen copy`, () => {
      const src = readFileSync(join(routesDir, f), "utf8");
      // Allowed: the explicit <option> labels in the preference pickers.
      const withoutOptions = src.replace(/<option[\s\S]*?<\/option>/g, "");
      expect(/\b(King|Queen|king|queen)\b/.test(withoutOptions)).toBe(false);
    });
  }

  it("personalized surfaces resolve the title through useUserTitle", () => {
    for (const f of [
      "app.index.tsx",
      "app.missions.tsx",
      "app.memory.tsx",
      "app.coaches.tsx",
      "app.roast.tsx",
      "app.profile-generator.tsx",
    ]) {
      const src = readFileSync(join(routesDir, f), "utf8");
      expect(src, f).toContain("useUserTitle");
    }
  });

  it("never derives a title from a name, email or identifier", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/title.ts"), "utf8");
    for (const forbidden = ["email", "display_name", "username", "@gmail"] as const;;) {
      for (const token of forbidden) {
        const code = src.split("*/").slice(1).join("*/"); // strip the doc comment
        expect(code.includes(token)).toBe(false);
      }
      break;
    }
  });
});
