import { describe, it, expect } from "vitest";
import { verifyLemonSignature } from "../../../src/lib/lemon";
import { sign, TEST_SECRET } from "../../fixtures/lemon";

describe("verifyLemonSignature", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts a valid HMAC signature", () => {
    expect(verifyLemonSignature(sign(body), body, TEST_SECRET)).toBe(true);
  });

  it("rejects a signature computed with a different secret", () => {
    expect(verifyLemonSignature(sign(body, "other"), body, TEST_SECRET)).toBe(false);
  });

  it("rejects a signature over a mutated body (replay/tamper)", () => {
    const sig = sign(body);
    expect(verifyLemonSignature(sig, body + "x", TEST_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyLemonSignature("", body, TEST_SECRET)).toBe(false);
  });

  it("rejects a non-hex / malformed signature", () => {
    expect(verifyLemonSignature("not-hex-!!!", body, TEST_SECRET)).toBe(false);
  });

  it("rejects a signature of the wrong length", () => {
    expect(verifyLemonSignature("deadbeef", body, TEST_SECRET)).toBe(false);
  });

  it("rejects when secret is empty", () => {
    expect(verifyLemonSignature(sign(body), body, "")).toBe(false);
  });

  it("is byte-sensitive: flipping one hex char fails", () => {
    const sig = sign(body);
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyLemonSignature(flipped, body, TEST_SECRET)).toBe(false);
  });
});
