/**
 * Extended failure-path and success-path coverage for the profile generator
 * core. Everything here is executed with an injected transport — no live
 * gateway, no fabricated evidence.
 */
import { describe, it, expect, vi } from "vitest";
import {
  MSG,
  callProfileAi,
  normalizeProfileResult,
  type ProfileGenInput,
} from "@/lib/profile-generator.core";
import { resolveProfileGenError } from "@/lib/profile-gen-error";
import { requireAiKey, AI_CONFIG_USER_MESSAGE } from "@/lib/ai-key";

const SECRET = "lv_super_secret_key_1234567890abcdef";

const input: ProfileGenInput = {
  hobbies: "boxing, thai food, vinyl",
  traits: "dry humor",
  vibe: "Confident & playful",
  age: "27",
  looking_for: "serious",
};

const GOOD_PAYLOAD = {
  headline: "Boxer who cooks",
  tinder: { bio: "Tinder bio text", opener: "Tinder opener text" },
  hinge: {
    prompts: [
      { prompt: "Prompt 1", answer: "Answer 1" },
      { prompt: "Prompt 2", answer: "Answer 2" },
      { prompt: "Prompt 3", answer: "Answer 3" },
    ],
    opener: "Hinge opener text",
  },
  bumble: { bio: "Bumble bio text", opener: "Bumble opener text" },
  tips: ["tip one", "tip two"],
};

function response(status: number, body: unknown = null, text = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as unknown as Response;
}

function completion(payload: unknown) {
  return response(200, { choices: [{ message: { content: JSON.stringify(payload) } }] });
}

describe("profile generator — failure taxonomy", () => {
  it("missing LOVABLE_API_KEY => user-safe configuration message", async () => {
    await expect(callProfileAi(input, { key: undefined })).rejects.toThrow(MSG.missingKey);
    expect(() => requireAiKey({}, { error: vi.fn(), warn: vi.fn() })).toThrowError(
      AI_CONFIG_USER_MESSAGE,
    );
  });

  it("invalid key (gateway 401) => upstream failure copy, key never echoed", async () => {
    const onGatewayError = vi.fn();
    await expect(
      callProfileAi(input, {
        key: SECRET,
        fetchImpl: (async () => response(401, null, "invalid api key")) as never,
        onGatewayError,
      }),
    ).rejects.toThrow(MSG.upstreamFailure);
    expect(JSON.stringify(onGatewayError.mock.calls)).not.toContain(SECRET);
  });

  it("HTTP 429 => exact rate-limit copy", async () => {
    await expect(
      callProfileAi(input, { key: SECRET, fetchImpl: (async () => response(429)) as never }),
    ).rejects.toThrow(MSG.tooManyRequests);
  });

  it("quota exceeded (402) => credits message; server quota error => plan-aware copy", async () => {
    await expect(
      callProfileAi(input, { key: SECRET, fetchImpl: (async () => response(402)) as never }),
    ).rejects.toThrow(MSG.creditsExhausted);

    const pro = resolveProfileGenError(
      JSON.stringify({ code: "PROFILE_GENERATION_LIMIT_REACHED", plan: "pro", limit: 30 }),
    );
    expect(pro.kind).toBe("quota");
    expect(pro.message).toBe("You've hit today's Pro limit (30). Upgrade to Elite for unlimited.");
    expect(pro.message).not.toMatch(/at .*\.ts:\d+|stack|Error:/);
  });

  it("gateway timeout / transport failure => user-safe upstream copy", async () => {
    const onGatewayError = vi.fn();
    const timeout = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    await expect(
      callProfileAi(input, {
        key: SECRET,
        fetchImpl: (async () => {
          throw timeout;
        }) as never,
        onGatewayError,
      }),
    ).rejects.toThrow(MSG.upstreamFailure);
    expect(onGatewayError).toHaveBeenCalledWith({
      status: 0,
      detail: "transport failure: TimeoutError",
    });
  });

  it("malformed AI JSON => parsing message", async () => {
    await expect(
      callProfileAi(input, {
        key: SECRET,
        fetchImpl: (async () =>
          response(200, { choices: [{ message: { content: "{not json" } }] })) as never,
      }),
    ).rejects.toThrow(MSG.malformedJson);
  });

  it("invalid schema => normalized, never thrown at the user", async () => {
    const out = await callProfileAi(input, {
      key: SECRET,
      fetchImpl: (async () =>
        completion({ tinder: 42, hinge: { prompts: "nope" }, tips: 7 })) as never,
    });
    expect(out).toEqual({
      headline: "",
      tinder: { bio: "", opener: "" },
      hinge: { prompts: [], opener: "" },
      bumble: { bio: "", opener: "" },
      tips: [],
    });
  });
});

describe("profile generator — success path and retry", () => {
  it("returns bios, prompt answers and opening lines for every platform", async () => {
    const out = await callProfileAi(input, {
      key: SECRET,
      fetchImpl: (async () => completion(GOOD_PAYLOAD)) as never,
    });
    // bios
    expect(out.tinder.bio).toBe("Tinder bio text");
    expect(out.bumble.bio).toBe("Bumble bio text");
    // prompt answers
    expect(out.hinge.prompts).toHaveLength(3);
    expect(out.hinge.prompts.every((p) => p.prompt && p.answer)).toBe(true);
    // opening lines
    expect(out.tinder.opener).toBe("Tinder opener text");
    expect(out.hinge.opener).toBe("Hinge opener text");
    expect(out.bumble.opener).toBe("Bumble opener text");
  });

  it("a retry after HTTP 429 succeeds (no state carried between attempts)", async () => {
    let attempt = 0;
    const fetchImpl = (async () => {
      attempt += 1;
      return attempt === 1 ? response(429) : completion(GOOD_PAYLOAD);
    }) as never;

    await expect(callProfileAi(input, { key: SECRET, fetchImpl })).rejects.toThrow(
      MSG.tooManyRequests,
    );
    const out = await callProfileAi(input, { key: SECRET, fetchImpl });
    expect(attempt).toBe(2);
    expect(out.headline).toBe("Boxer who cooks");
  });

  it("normalization caps hinge prompts at 3 and tips at 6", () => {
    const out = normalizeProfileResult({
      hinge: {
        prompts: Array.from({ length: 9 }, (_, i) => ({ prompt: `p${i}`, answer: `a${i}` })),
      },
      tips: Array.from({ length: 12 }, (_, i) => `tip ${i}`),
    });
    expect(out.hinge.prompts).toHaveLength(3);
    expect(out.tips).toHaveLength(6);
  });
});
