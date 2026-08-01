import { describe, it, expect } from "vitest";
import { isCronAuthorized, extractBearerToken, timingSafeEqualStr } from "@/lib/cron-auth";

const SECRET = "s3cret-cron-value-abcdefg";

describe("cron auth", () => {
  it("accepts a correct bearer token", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it("rejects missing header", () => {
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized("", SECRET)).toBe(false);
  });
  it("rejects wrong scheme", () => {
    expect(isCronAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false);
  });
  it("rejects wrong token", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer wrong`, SECRET)).toBe(false);
  });
  it("rejects when server has no secret configured", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
  });
  it("is case-insensitive on the scheme", () => {
    expect(isCronAuthorized(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isCronAuthorized(`BEARER ${SECRET}`, SECRET)).toBe(true);
  });
  it("extractBearerToken strips prefix and trims", () => {
    expect(extractBearerToken("Bearer   abc  ")).toBe("abc");
    expect(extractBearerToken("nope")).toBe("");
  });
  it("timingSafeEqualStr length mismatch → false without leaking", () => {
    expect(timingSafeEqualStr("a", "aa")).toBe(false);
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
  });
});
