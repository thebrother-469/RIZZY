import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  EMAIL_TEMPLATE_KEYS,
  addressee,
  renderAllEmails,
  renderEmail,
  type EmailContext,
} from "@/lib/emails/templates";

const KING: EmailContext = { profile: { preferred_title: "king" }, firstName: "John" };
const QUEEN: EmailContext = { profile: { preferred_title: "queen" }, firstName: "Jessica" };
const NEUTRAL: EmailContext = { profile: null };

describe("email salutation propagation", () => {
  it("addresses a stored preference with the name as a suffix only", () => {
    expect(addressee(KING)).toBe("King John");
    expect(addressee(QUEEN)).toBe("Queen Jessica");
    expect(addressee(NEUTRAL)).toBe("Champion");
    // A name is never a title signal.
    expect(addressee({ profile: null, firstName: "Kingsley" })).toBe("Champion Kingsley");
  });

  it("covers onboarding, premium and notification surfaces", () => {
    const categories = new Set(renderAllEmails(NEUTRAL).map((e) => e.category));
    expect([...categories].sort()).toEqual(["notification", "onboarding", "premium"]);
    for (const required of [
      "onboarding-welcome",
      "onboarding-complete",
      "onboarding-mission-unlock",
      "onboarding-streak-intro",
      "onboarding-coach-intro",
      "premium-upgrade",
      "premium-subscription-confirmation",
      "premium-renewal",
      "premium-cancellation",
      "premium-receipt",
      "premium-trial",
      "premium-entitlement",
      "notify-mission-reminder",
      "notify-streak-reminder",
      "notify-achievement",
      "notify-profile",
    ]) {
      expect(EMAIL_TEMPLATE_KEYS, required).toContain(required);
    }
  });

  // Snapshot contract: every template must greet with the resolved salutation
  // and must never contain a foreign one.
  for (const key of EMAIL_TEMPLATE_KEYS) {
    it(`${key} renders the correct greeting for every title`, () => {
      const king = renderEmail(key, KING);
      expect(king.greeting).toContain("King John");
      expect(king.subject).toContain("King John");
      expect(king.text).not.toMatch(/\b(Queen|Champion)\b/);

      const queen = renderEmail(key, QUEEN);
      expect(queen.greeting).toContain("Queen Jessica");
      expect(queen.subject).toContain("Queen Jessica");
      expect(queen.text).not.toMatch(/\b(King|Champion)\b/);

      const neutral = renderEmail(key, NEUTRAL);
      expect(neutral.greeting).toContain("Champion");
      expect(neutral.subject).toContain("Champion");
      expect(neutral.text).not.toMatch(/\b(King|Queen)\b/);
    });
  }

  it("honours the legacy self-declared value on an onboarded profile", () => {
    const legacy = renderEmail("premium-upgrade", {
      profile: { gender: "female", onboarded_at: "2026-01-01T00:00:00.000Z" },
      firstName: "Jessica",
    });
    expect(legacy.heading).toContain("Queen Jessica");
  });
});

/** No source file outside the single helper may hardcode a salutation. */
describe("no hardcoded salutations", () => {
  const ALLOWED = ["src/lib/title.ts"];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const p = join(dir, entry);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
    });

  const files = walk(join(process.cwd(), "src")).filter(
    (f) => !ALLOWED.some((a) => f.endsWith(a)),
  );

  it("scans the whole source tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const rel = file.slice(process.cwd().length + 1);
    it(`${rel} uses the shared helper`, () => {
      const src = readFileSync(file, "utf8")
        .replace(/<option[\s\S]*?<\/option>/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "") // doc comments describe the contract
        .replace(/^\s*\/\/.*$/gm, "");
      expect(/\b(King|Queen|Champion)\b/.test(src), `${rel} hardcodes a salutation`).toBe(false);
    });
  }
});
