import { describe, it, expect, vi } from "vitest";
import {
  AI_ERROR_CATEGORIES,
  AI_USER_MESSAGE,
  aiErrorLogFields,
  categorizeGatewayStatus,
  logAiError,
} from "@/lib/ai-error-log";
import { AI_CONFIG_USER_MESSAGE, requireAiKey } from "@/lib/ai-key";
import { MSG, callProfileAi, type ProfileGenInput } from "@/lib/profile-generator.core";
import { resolveProfileGenError } from "@/lib/profile-gen-error";
import { buildLogRecord } from "@/lib/structured-logger";

const SECRET = "lv_super_secret_key_1234567890abcdef";

const input: ProfileGenInput = {
  hobbies: "boxing",
  traits: "dry humor",
  vibe: "Confident & playful",
  age: "27",
  looking_for: "serious",
};

function gatewayResponse(status: number, body: unknown = null, text = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as unknown as Response;
}

describe("AI error taxonomy — user-safe messages", () => {
  it("covers every category with a non-empty, internals-free message", () => {
    for (const c of AI_ERROR_CATEGORIES) {
      const m = AI_USER_MESSAGE[c];
      expect(m.length).toBeGreaterThan(0);
      expect(m).not.toMatch(/lv_|process\.env|at .*\.ts:\d+|Error:|stack/i);
      expect(m).not.toContain(SECRET);
    }
  });

  it("maps gateway statuses to the right category", () => {
    expect(categorizeGatewayStatus(401)).toBe("authentication_error");
    expect(categorizeGatewayStatus(403)).toBe("authentication_error");
    expect(categorizeGatewayStatus(429)).toBe("rate_limit");
    expect(categorizeGatewayStatus(402)).toBe("quota_exceeded");
    expect(categorizeGatewayStatus(500)).toBe("service_error");
  });

  it("uses the exact 429 copy required by the product spec", () => {
    expect(AI_USER_MESSAGE.rate_limit).toBe("Too many requests, wait 30 seconds");
  });
});

describe("AI error taxonomy — structured operator logs", () => {
  it("always includes timestamp, subsystem, category and correlation IDs", () => {
    const fields = aiErrorLogFields(
      {
        subsystem: "profile-generator",
        category: "service_error",
        request_id: "req-9",
        trace_id: "trace-9",
        user_id: "user-9",
        status: 500,
        detail: "upstream exploded",
      },
      new Date("2026-07-31T12:00:00.000Z"),
    );
    expect(fields).toMatchObject({
      ts: "2026-07-31T12:00:00.000Z",
      event: "ai_error",
      subsystem: "profile-generator",
      error_category: "service_error",
      request_id: "req-9",
      trace_id: "trace-9",
      status: 500,
    });
  });

  it("emits the log and returns the user-safe message", () => {
    const log = { error: vi.fn() };
    const msg = logAiError(log, { subsystem: "profile-generator", category: "parsing_error" });
    expect(msg).toBe(MSG.malformedJson);
    expect(log.error).toHaveBeenCalledWith(
      "ai_error",
      expect.objectContaining({ ts: expect.any(String) }),
    );
  });

  it("never lets a secret reach the emitted record", () => {
    const record = buildLogRecord(
      "error",
      `gateway rejected key`,
      aiErrorLogFields({
        subsystem: "profile-generator",
        category: "authentication_error",
        detail: `api_key=${SECRET}`,
        // secret-shaped fields are redacted by the logger
        api_key: SECRET,
      } as never),
    );
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(SECRET);
  });
});

describe("end-to-end failure paths (what the user actually sees)", () => {
  it("missing AI key => configuration error, user-safe copy, operator log without the secret", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    expect(() => requireAiKey({}, log, { request_id: "req-1" })).toThrowError(
      AI_CONFIG_USER_MESSAGE,
    );
    const [, fields] = log.error.mock.calls[0];
    expect(fields).toMatchObject({ code: "AI_KEY_MISSING", request_id: "req-1" });
    expect(JSON.stringify(fields)).not.toContain(SECRET);
  });

  it("invalid AI key => configuration error, never echoes the value", () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    expect(() => requireAiKey({ LOVABLE_API_KEY: `${SECRET} ` }, log)).toThrowError(
      AI_CONFIG_USER_MESSAGE,
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(SECRET.trim());
  });

  it("HTTP 429 => the exact rate-limit message", async () => {
    await expect(
      callProfileAi(input, { key: SECRET, fetchImpl: (async () => gatewayResponse(429)) as never }),
    ).rejects.toThrow(MSG.tooManyRequests);
  });

  it("quota exceeded => plan-aware message, no internals", () => {
    const view = resolveProfileGenError(
      JSON.stringify({ code: "PROFILE_GENERATION_LIMIT_REACHED", plan: "free", limit: 3 }),
    );
    expect(view.kind).toBe("quota");
    expect(view.message).toBe("You've hit today's free limit (3). Upgrade to Pro for 30/day.");
  });

  it("malformed AI JSON => parsing error message", async () => {
    const fetchImpl = (async () =>
      gatewayResponse(200, { choices: [{ message: { content: "{oops" } }] })) as never;
    await expect(callProfileAi(input, { key: SECRET, fetchImpl })).rejects.toThrow(
      MSG.malformedJson,
    );
  });

  it("invalid schema => normalized, never thrown at the user", async () => {
    const fetchImpl = (async () =>
      gatewayResponse(200, {
        choices: [{ message: { content: JSON.stringify({ tinder: 5, hinge: { prompts: "x" } }) } }],
      })) as never;
    const out = await callProfileAi(input, { key: SECRET, fetchImpl });
    expect(out.tinder).toEqual({ bio: "", opener: "" });
    expect(out.hinge.prompts).toEqual([]);
  });

  it("upstream failure => service error, secret never present in the reported detail", async () => {
    const onGatewayError = vi.fn();
    await expect(
      callProfileAi(input, {
        key: SECRET,
        fetchImpl: (async () => gatewayResponse(500, null, "boom")) as never,
        onGatewayError,
      }),
    ).rejects.toThrow(MSG.upstreamFailure);
    expect(JSON.stringify(onGatewayError.mock.calls)).not.toContain(SECRET);
  });
});
