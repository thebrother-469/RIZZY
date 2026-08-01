import { describe, it, expect, vi } from "vitest";
import {
  AI_CONFIG_USER_MESSAGE,
  AI_KEY_ENV_NAME,
  AI_KEY_MISSING_LOG_MESSAGE,
  AiConfigurationError,
  OPERATOR_ACTION_INVALID,
  OPERATOR_ACTION_MISSING,
  reportAiKeyAtStartup,
  requireAiKey,
  resolveAiKey,
  validateAiKeyValue,
} from "@/lib/ai-key";
import { validateEnv } from "@/lib/env-validation";

const VALID = "lv_workspace_key_1234567890abcd";
const LEGACY = "lv_legacy_alias_key_1234567890ab";

const baseEnv = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key-value",
  VITE_SUPABASE_PROJECT_ID: "abcdef123",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value",
};

describe("validateAiKeyValue", () => {
  it("accepts a well-formed key", () => {
    expect(validateAiKeyValue(VALID)).toBeNull();
  });

  it.each([
    [undefined, "not set"],
    [null, "not set"],
    ["", "empty or whitespace-only"],
    ["   ", "empty or whitespace-only"],
    [" lv_profile_key_1234567890abcdef", "has leading/trailing whitespace"],
    ["lv_profile key_1234567890abcdef", "contains whitespace"],
    ['"lv_profile_key_1234567890abcde"', "wrapped in quotes"],
    ["changeme", "looks like a placeholder value"],
    ["short", "too short (5 < 20 chars)"],
  ])("rejects %p", (input, reason) => {
    expect(validateAiKeyValue(input as string | null | undefined)).toBe(reason);
  });
});

describe("resolveAiKey", () => {
  it("resolves the single canonical LOVABLE_API_KEY", () => {
    const r = resolveAiKey({ [AI_KEY_ENV_NAME]: VALID });
    expect(r).toMatchObject({ ok: true, key: VALID, usedFallback: false });
    if (r.ok) expect(r.meta.source).toBe("LOVABLE_API_KEY");
  });

  it("prefers LOVABLE_API_KEY over any deprecated alias", () => {
    const r = resolveAiKey({ LOVABLE_API_KEY: VALID, LOVABLE_API_KEY_PROFILE: LEGACY });
    expect(r).toMatchObject({ ok: true, key: VALID, usedFallback: false });
  });

  it("still resolves a legacy alias, flagged as a fallback", () => {
    const r = resolveAiKey({ LOVABLE_API_KEY_PROFILE: LEGACY });
    expect(r).toMatchObject({ ok: true, key: LEGACY, usedFallback: true });
  });

  it("reports AI_KEY_MISSING with the exact operator log line when nothing is set", () => {
    const r = resolveAiKey({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("AI_KEY_MISSING");
      expect(r.reason).toBe(AI_KEY_MISSING_LOG_MESSAGE);
      expect(r.operatorAction).toBe(OPERATOR_ACTION_MISSING);
    }
  });

  it("reports AI_KEY_INVALID for a present-but-broken key and does not fall through", () => {
    const r = resolveAiKey({ LOVABLE_API_KEY: "changeme", LOVABLE_API_KEY_PROFILE: VALID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("AI_KEY_INVALID");
      expect(r.operatorAction).toBe(OPERATOR_ACTION_INVALID);
    }
  });
});

describe("requireAiKey", () => {
  it("returns the key when valid and logs nothing", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    expect(requireAiKey({ [AI_KEY_ENV_NAME]: VALID }, log)).toBe(VALID);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("throws a user-safe AiConfigurationError and logs operator detail", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    expect(() => requireAiKey({}, log, { request_id: "req-1" })).toThrowError(AiConfigurationError);
    expect(log.error).toHaveBeenCalledTimes(1);
    const [event, fields] = log.error.mock.calls[0];
    expect(event).toBe("ai_key_configuration_error");
    expect(fields).toMatchObject({
      code: "AI_KEY_MISSING",
      request_id: "req-1",
      env_var: "LOVABLE_API_KEY",
      reason: AI_KEY_MISSING_LOG_MESSAGE,
      operator_action: OPERATOR_ACTION_MISSING,
    });
  });

  it("never leaks the secret through the error or the log", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const secret = "lv_secret_value_that_is_invalid_because_of space";
    try {
      requireAiKey({ [AI_KEY_ENV_NAME]: secret }, log);
    } catch (e) {
      const err = e as AiConfigurationError;
      expect(err.message).toBe(AI_CONFIG_USER_MESSAGE);
      expect(JSON.stringify(err.operator)).not.toContain(secret);
    }
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(secret);
  });
});

describe("startup validation", () => {
  it("logs the exact required line at startup when the key is missing", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const r = reportAiKeyAtStartup({}, log);
    expect(r.ok).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      AI_KEY_MISSING_LOG_MESSAGE,
      expect.objectContaining({ code: "AI_KEY_MISSING" }),
    );
  });

  it("warns when running on a deprecated alias", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const r = reportAiKeyAtStartup({ LOVABLE_API_KEY_PROFILE: LEGACY }, log);
    expect(r.ok).toBe(true);
    expect(log.warn).toHaveBeenCalledWith("ai_key_startup_deprecated_alias", expect.anything());
  });

  it("is silent when LOVABLE_API_KEY is present and valid", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    reportAiKeyAtStartup({ [AI_KEY_ENV_NAME]: VALID }, log);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("env validation flags a malformed LOVABLE_API_KEY", () => {
    const r = validateEnv({ ...baseEnv, LOVABLE_API_KEY: "changeme" });
    expect(r.ok).toBe(false);
    expect(r.invalid.map((i) => i.name)).toContain("LOVABLE_API_KEY");
  });

  it("env validation passes with a valid LOVABLE_API_KEY", () => {
    const r = validateEnv({ ...baseEnv, LOVABLE_API_KEY: VALID });
    expect(r.ok).toBe(true);
    expect(r.presentOptional).toContain("LOVABLE_API_KEY");
  });

  it("env validation stays ok when no AI key is present", () => {
    const r = validateEnv({ ...baseEnv });
    expect(r.ok).toBe(true);
    expect(r.presentOptional).not.toContain("LOVABLE_API_KEY");
  });
});
