import { describe, it, expect, vi } from "vitest";
import {
  MSG,
  callProfileAi,
  classifyQuotaError,
  nextUtcMidnightIso,
  normalizeProfileResult,
  userPrompt,
  type ProfileGenInput,
} from "@/lib/profile-generator.core";
import { resolveProfileGenError } from "@/lib/profile-gen-error";

const input: ProfileGenInput = {
  hobbies: "boxing, thai food",
  traits: "dry humor",
  vibe: "Confident & playful",
  age: "27",
  looking_for: "serious",
};

const goodPayload = {
  headline: "Boxer who cooks better than your ex",
  tinder: { bio: "Tinder bio", opener: "Tinder opener" },
  hinge: {
    prompts: [
      { prompt: "Two truths", answer: "Hinge answer 1" },
      { prompt: "My simple pleasure", answer: "Hinge answer 2" },
      { prompt: "Dating me is like", answer: "Hinge answer 3" },
      { prompt: "extra", answer: "should be trimmed" },
    ],
    opener: "Hinge opener",
  },
  bumble: { bio: "Bumble bio", opener: "Bumble opener" },
  tips: ["tip a", "tip b", 42],
};

function gatewayResponse(body: unknown, init: { status?: number; text?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => init.text ?? "",
  } as unknown as Response;
}

function aiResponse(content: string, status = 200) {
  return gatewayResponse({ choices: [{ message: { content } }] }, { status });
}

describe("profile generator core", () => {
  it("fails closed with the operator message when LOVABLE_API_KEY is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(
      callProfileAi(input, { key: undefined, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(MSG.missingKey);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces an upstream 500 as a friendly failure and reports the gateway detail", async () => {
    const onGatewayError = vi.fn();
    const fetchImpl = vi.fn(async () =>
      gatewayResponse(null, { status: 500, text: "upstream exploded" }),
    );
    await expect(
      callProfileAi(input, {
        key: "k",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onGatewayError,
      }),
    ).rejects.toThrow(MSG.upstreamFailure);
    expect(onGatewayError).toHaveBeenCalledWith({ status: 500, detail: "upstream exploded" });
  });

  it("maps a 402 to the credits-exhausted message", async () => {
    const fetchImpl = vi.fn(async () => gatewayResponse(null, { status: 402 }));
    await expect(
      callProfileAi(input, { key: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(MSG.creditsExhausted);
  });

  it("maps an upstream 429 to the exact rate-limit message", async () => {
    const fetchImpl = vi.fn(async () => gatewayResponse(null, { status: 429 }));
    await expect(
      callProfileAi(input, { key: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("Too many requests, wait 30 seconds");
    expect(MSG.tooManyRequests).toBe("Too many requests, wait 30 seconds");
  });

  it("rejects malformed AI JSON", async () => {
    const fetchImpl = vi.fn(async () => aiResponse("{ not json"));
    await expect(
      callProfileAi(input, { key: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(MSG.malformedJson);
  });

  it("rejects a response with no message content", async () => {
    const fetchImpl = vi.fn(async () => gatewayResponse({ choices: [] }));
    await expect(
      callProfileAi(input, { key: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(MSG.upstreamFailure);
  });

  it("parses a successful generation and returns bios, prompt answers, and openers", async () => {
    const fetchImpl = vi.fn(async () => aiResponse(JSON.stringify(goodPayload)));
    const out = await callProfileAi(input, {
      key: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // bios
    expect(out.tinder.bio).toBe("Tinder bio");
    expect(out.bumble.bio).toBe("Bumble bio");
    // prompt answers
    expect(out.hinge.prompts).toHaveLength(3);
    expect(out.hinge.prompts.map((p) => p.answer)).toEqual([
      "Hinge answer 1",
      "Hinge answer 2",
      "Hinge answer 3",
    ]);
    // opening lines
    expect(out.tinder.opener).toBe("Tinder opener");
    expect(out.hinge.opener).toBe("Hinge opener");
    expect(out.bumble.opener).toBe("Bumble opener");
    expect(out.headline).toContain("Boxer");
    expect(out.tips).toEqual(["tip a", "tip b"]); // non-strings dropped

    const [url, init] = fetchImpl.mock.calls[0] as unknown[];
    expect(url).toContain("ai.gateway.lovable.dev");
    expect(init.headers["Lovable-API-Key"]).toBe("k");
    expect(JSON.parse(init.body).response_format).toEqual({ type: "json_object" });
  });

  it("normalizes an invalid response schema instead of crashing the UI", () => {
    const out = normalizeProfileResult({
      headline: 12,
      tinder: "nope",
      hinge: { prompts: "nope" },
      tips: "nope",
    });
    expect(out).toEqual({
      headline: "",
      tinder: { bio: "", opener: "" },
      hinge: { prompts: [], opener: "" },
      bumble: { bio: "", opener: "" },
      tips: [],
    });
    expect(normalizeProfileResult(null).headline).toBe("");
    expect(normalizeProfileResult(undefined).tips).toEqual([]);
    // Malformed prompt entries are filtered, valid ones normalized.
    const mixed = normalizeProfileResult({
      hinge: { prompts: [null, { prompt: "p", answer: 5 }, { prompt: "q", answer: "a" }] },
    });
    expect(mixed.hinge.prompts).toEqual([
      { prompt: "p", answer: "" },
      { prompt: "q", answer: "a" },
    ]);
  });

  it("builds a prompt containing every user input", () => {
    const p = userPrompt(input);
    expect(p).toContain("boxing, thai food");
    expect(p).toContain("dry humor");
    expect(p).toContain("Confident & playful");
    expect(p).toContain("27");
  });

  it("classifies quota-exceeded Postgres errors and ignores unrelated ones", () => {
    expect(
      classifyQuotaError(
        { message: "profile_gen_limit_reached", details: JSON.stringify({ used_today: 3 }) },
        0,
      ),
    ).toEqual({ used_today: 3 });
    expect(classifyQuotaError({ message: "connection reset" }, 3)).toBeNull();
    expect(classifyQuotaError(null, 3)).toBeNull();
    // Falls back when DETAIL is unparseable.
    expect(classifyQuotaError({ message: "profile_gen_limit_reached", details: "??" }, 7)).toEqual({
      used_today: 7,
    });
  });

  it("resets quota at the next UTC midnight", () => {
    const iso = nextUtcMidnightIso(new Date("2026-07-31T13:00:00.000Z"));
    expect(iso).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("client error mapping (what the toast shows)", () => {
  it("renders the exact rate-limit copy for a 429 payload", () => {
    const view = resolveProfileGenError(
      JSON.stringify({ code: "RATE_LIMIT_EXCEEDED", retry_after: 30 }),
    );
    expect(view.kind).toBe("rate_limit");
    expect(view.message).toBe("Too many requests, wait 30 seconds");
  });

  it("renders a plan-aware quota message", () => {
    expect(
      resolveProfileGenError(
        JSON.stringify({ code: "PROFILE_GENERATION_LIMIT_REACHED", plan: "free", limit: 3 }),
      ).message,
    ).toBe("You've hit today's free limit (3). Upgrade to Pro for 30/day.");
    expect(
      resolveProfileGenError(
        JSON.stringify({ code: "PROFILE_GENERATION_LIMIT_REACHED", plan: "pro", limit: 30 }),
      ).message,
    ).toBe("You've hit today's Pro limit (30). Upgrade to Elite for unlimited.");
  });

  it("passes upstream messages through verbatim (including the 30s rate-limit copy)", () => {
    expect(resolveProfileGenError("Too many requests, wait 30 seconds").message).toBe(
      "Too many requests, wait 30 seconds",
    );
    expect(resolveProfileGenError(MSG.missingKey).message).toBe(MSG.missingKey);
    expect(resolveProfileGenError(undefined).message).toBe("Couldn't generate. Try again.");
  });
});

describe("retry flow", () => {
  it("a failed generation can be retried and succeed on the second attempt", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      return call === 1
        ? gatewayResponse(null, { status: 500, text: "flaky" })
        : aiResponse(JSON.stringify(goodPayload));
    });
    await expect(
      callProfileAi(input, { key: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(MSG.upstreamFailure);
    const out = await callProfileAi(input, {
      key: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.headline).toContain("Boxer");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
