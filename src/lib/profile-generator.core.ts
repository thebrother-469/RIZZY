/**
 * Pure, dependency-injected core of the dating-profile generator.
 *
 * Lives outside `*.functions.ts` so it can be unit-tested directly (the
 * server-fn wrapper must stay thin) and so the AI call, parsing, and
 * normalization are covered without a live gateway.
 */
import { z } from "zod";

export const ProfileGenInputSchema = z.object({
  hobbies: z.string().trim().max(500),
  traits: z.string().trim().max(500),
  vibe: z.string().trim().max(120),
  age: z.string().trim().max(10).optional().default(""),
  looking_for: z.string().trim().max(200).optional().default(""),
});

export type ProfileGenInput = z.infer<typeof ProfileGenInputSchema>;

export type ProfileGenResult = {
  tinder: { bio: string; opener: string };
  hinge: { prompts: { prompt: string; answer: string }[]; opener: string };
  bumble: { bio: string; opener: string };
  headline: string;
  tips: string[];
};

export const AI_MODEL = "openai/gpt-5.5";
export const AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Exact user-facing strings. Asserted by tests and by the UI. */
export const MSG = {
  missingKey: "The AI service is temporarily unavailable. Please contact the administrator.",
  creditsExhausted: "AI credits exhausted. Add credits in your workspace billing settings.",
  tooManyRequests: "Too many requests, wait 30 seconds",
  upstreamFailure: "AI is thinking too hard, try again",
  malformedJson: "AI returned malformed JSON. Try again.",
} as const;

export const SYSTEM = `You are RizzGod, an elite dating profile copywriter. You write high-converting, brutally honest, magnetic dating profiles for men on Tinder, Hinge, and Bumble. Rules:
- Confident, specific, playful, NEVER cringe, NEVER simp energy, NEVER emojis unless one lands hard.
- Show, don't tell. Concrete details beat generic adjectives.
- Match platform character norms: Tinder bio ~200-400 chars, Hinge answers 1-2 sentences, Bumble bio ~150-300 chars.
- Return STRICT JSON matching the requested schema. No markdown, no commentary.`;

export function userPrompt(i: ProfileGenInput) {
  return `Generate a full high-conversion dating profile pack for this guy.

Hobbies / interests:
${i.hobbies || "(none provided)"}

Personality traits:
${i.traits || "(none provided)"}

Desired vibe: ${i.vibe || "confident, playful"}
Age: ${i.age || "(unspecified)"}
Looking for: ${i.looking_for || "(unspecified)"}

Return JSON with this exact shape:
{
  "headline": "one-line tagline that captures his edge",
  "tinder": { "bio": "...", "opener": "an opener he can send to any match" },
  "hinge": {
    "prompts": [
      { "prompt": "Hinge prompt title", "answer": "his answer" },
      { "prompt": "...", "answer": "..." },
      { "prompt": "...", "answer": "..." }
    ],
    "opener": "a Hinge-style opener referencing a prompt"
  },
  "bumble": { "bio": "...", "opener": "a Bumble-style opener (women message first, so give him a great reply-to-hi)" },
  "tips": ["3-5 short tips to level up his profile photos / prompts / energy"]
}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Loose shape of the AI JSON payload before normalization. */
interface ProfileAiPayload {
  headline?: unknown;
  tinder?: { bio?: unknown; opener?: unknown };
  hinge?: { prompts?: unknown; opener?: unknown };
  bumble?: { bio?: unknown; opener?: unknown };
  tips?: unknown;
}

/** Minimal shape of an OpenAI-compatible chat completion response. */
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Defensive normalization so a partial / off-schema AI response can never
 * crash the UI. Always returns every field with the right primitive type.
 */
export function normalizeProfileResult(parsed: unknown): ProfileGenResult {
  const p = (parsed ?? {}) as ProfileAiPayload;
  const prompts = Array.isArray(p.hinge?.prompts) ? p.hinge.prompts : [];
  return {
    headline: str(p.headline),
    tinder: { bio: str(p.tinder?.bio), opener: str(p.tinder?.opener) },
    hinge: {
      prompts: prompts
        .filter((x: unknown) => !!x && typeof x === "object")
        .slice(0, 3)
        .map((x) => {
          const item = x as { prompt?: unknown; answer?: unknown };
          return { prompt: str(item.prompt), answer: str(item.answer) };
        }),
      opener: str(p.hinge?.opener),
    },
    bumble: { bio: str(p.bumble?.bio), opener: str(p.bumble?.opener) },
    tips: Array.isArray(p.tips)
      ? p.tips.filter((t: unknown) => typeof t === "string").slice(0, 6)
      : [],
  };
}

export interface CallProfileAiDeps {
  key?: string | null;
  fetchImpl?: typeof fetch;
  onGatewayError?: (info: { status: number; detail: string }) => void;
}

/**
 * Performs the gateway call and returns a normalized result.
 * Throws Errors whose `.message` is one of `MSG.*` — the client surfaces the
 * message verbatim, so these strings are part of the contract.
 */
export async function callProfileAi(
  input: ProfileGenInput,
  deps: CallProfileAiDeps = {},
): Promise<ProfileGenResult> {
  const key = deps.key;
  if (!key) throw new Error(MSG.missingKey);
  const doFetch = deps.fetchImpl ?? fetch;

  // A transport failure (gateway timeout, DNS, socket reset) must surface the
  // same user-safe copy as any other upstream failure — never a raw internal
  // error string.
  let res: Response;
  try {
    res = await doFetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(input) },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (e: unknown) {
    deps.onGatewayError?.({
      status: 0,
      detail: `transport failure: ${e instanceof Error ? e.name : "unknown"}`,
    });
    throw new Error(MSG.upstreamFailure, { cause: e });
  }

  if (res.status === 402) throw new Error(MSG.creditsExhausted);
  if (res.status === 429) throw new Error(MSG.tooManyRequests);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    deps.onGatewayError?.({ status: res.status, detail: detail.slice(0, 300) });
    throw new Error(MSG.upstreamFailure);
  }

  const json = await res.json().catch(() => null);
  const raw = (json as ChatCompletionResponse | null)?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error(MSG.upstreamFailure);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(MSG.malformedJson);
  }
  return normalizeProfileResult(parsed);
}

/**
 * Classifies a Postgres error coming back from `consume_profile_gen_quota`.
 * Returns `null` when the error is not a quota-limit error.
 */
export function classifyQuotaError(
  err: { message?: string | null; details?: string | null } | null | undefined,
  fallbackUsed: number,
): { used_today: number } | null {
  if (!err) return null;
  const message = String(err.message ?? "");
  const details = String(err.details ?? "");
  const isLimit = message.includes("profile_gen_limit_reached") || details.includes("used_today");
  if (!isLimit) return null;
  let used_today = fallbackUsed;
  try {
    const parsed = JSON.parse(details || "{}");
    used_today = Number(parsed.used_today ?? used_today);
  } catch {
    /* ignore */
  }
  return { used_today };
}

export function nextUtcMidnightIso(now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
