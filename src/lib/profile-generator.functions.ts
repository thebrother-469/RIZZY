import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logger, newRequestId } from "./structured-logger";
import { requireAiKey } from "./ai-key";
import { categorizeGatewayStatus, logAiError } from "./ai-error-log";

import { checkRateLimit, rateLimitResponseBody } from "./rate-limit";
import { resolveTraceContext } from "./otel";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import {
  ProfileGenInputSchema,
  callProfileAi,
  classifyQuotaError,
  nextUtcMidnightIso,
  type ProfileGenInput,
  type ProfileGenResult,
} from "./profile-generator.core";

const InputSchema = ProfileGenInputSchema;

export type { ProfileGenInput, ProfileGenResult };

/**
 * Structured error thrown when a caller has exceeded their daily profile
 * generation quota. The server-fn layer serializes the `.message` to the
 * client, so we JSON-encode a stable payload the UI can parse and render
 * as a proper 429 with retry_after / plan / usage details.
 */
export class ProfileGenLimitError extends Error {
  readonly code = "PROFILE_GENERATION_LIMIT_REACHED";
  readonly httpStatus = 429;
  constructor(
    readonly info: {
      used_today: number;
      limit: number;
      remaining: number;
      reset_time: string;
      plan: "free" | "pro" | "elite";
      request_id: string;
      trace_id: string;
    },
  ) {
    super(
      JSON.stringify({
        code: "PROFILE_GENERATION_LIMIT_REACHED",
        ...info,
      }),
    );
    this.name = "ProfileGenLimitError";
  }
}

/**
 * Read-only usage lookup for the account usage panel. Uses the caller's
 * authenticated Supabase client so RLS applies (SECURITY DEFINER on the
 * RPC scopes results to auth.uid()).
 */
export const getProfileGenUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();
    const activeStatuses = new Set(["active", "on_trial", "trialing", "past_due"]);
    const plan: "free" | "pro" | "elite" =
      sub &&
      activeStatuses.has(String(sub.status ?? "")) &&
      (sub.plan === "pro" || sub.plan === "elite")
        ? (sub.plan as "pro" | "elite")
        : "free";
    const limit = plan === "free" ? 3 : plan === "pro" ? 30 : null; // null = unlimited

    const { data: usage } = await supabaseAdmin.rpc("get_profile_gen_usage_today", {
      _caller_id: userId,
    } as never);
    const used = Number((usage as { used?: number } | null)?.used ?? 0);
    return {
      plan,
      used,
      limit,
      remaining: limit == null ? null : Math.max(0, limit - used),
      reset_time: nextUtcMidnightIso(),
    };
  });

/**
 * Structured error for Upstash rate-limit denial. Mirrors the JSON-in-message
 * pattern of ProfileGenLimitError so the client can render a real 429.
 */
export class RateLimitError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";
  readonly httpStatus = 429;
  constructor(readonly body: ReturnType<typeof rateLimitResponseBody>) {
    super(JSON.stringify({ code: "RATE_LIMIT_EXCEEDED", ...body }));
    this.name = "RateLimitError";
  }
}

export const generateDatingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProfileGenResult> => {
    const { userId } = context as { userId: string };
    const request_id = newRequestId();
    // Single unified AI runtime secret: LOVABLE_API_KEY.
    // Read inside the handler (server-only, never bundled to the client).
    // Throws AiConfigurationError (user-safe message, operator-only detail).
    const key = requireAiKey(process.env, logger, { user_id: userId, request_id });

    const incomingTp = (() => {
      try {
        return getRequestHeader("traceparent") ?? null;
      } catch {
        return null;
      }
    })();
    const trace = resolveTraceContext(incomingTp, request_id);
    const trace_id = trace.trace_id;
    const clientIp = (() => {
      try {
        return getRequestIP({ xForwardedFor: true }) ?? userId;
      } catch {
        return userId;
      }
    })();

    // Upstash sliding-window limit. 10 gens / 60s per identity (well above
    // the daily plan cap so this only trips on abusive bursts).
    const rl = await checkRateLimit({
      route: "profile_gen",
      windowSec: 60,
      max: 10,
      identity: userId || clientIp,
      request_id,
      trace_id,
    });
    if (!rl.allowed) {
      logger.warn("rate_limit_denied", {
        event: "rate_limit_denied",
        route: "profile_gen",
        user_id: userId,
        request_id,
        trace_id,
        limit: rl.limit,
        retry_after: rl.retry_after,
      });
      throw new RateLimitError(rateLimitResponseBody(rl));
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve plan tier (server-side, never trust client).
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();
    const activeStatuses = new Set(["active", "on_trial", "trialing", "past_due"]);
    const plan: "free" | "pro" | "elite" =
      sub &&
      activeStatuses.has(String(sub.status ?? "")) &&
      (sub.plan === "pro" || sub.plan === "elite")
        ? (sub.plan as "pro" | "elite")
        : "free";
    const dailyCap: number | null = plan === "free" ? 3 : plan === "pro" ? 30 : null;

    // Atomic check-and-increment via SECURITY DEFINER RPC. Cannot be raced
    // by parallel requests or double-clicks because the INSERT ... ON
    // CONFLICT DO UPDATE WHERE clause is a single statement in Postgres.
    // Elite/unlimited: still records for observability, never blocks.
    const { data: quotaRow, error: quotaErr } = await supabaseAdmin.rpc(
      "consume_profile_gen_quota",
      { _cap: dailyCap ?? 0, _caller_id: userId } as never,
    );

    if (quotaErr) {
      // Postgres RAISE EXCEPTION on limit reached. DETAIL carries structured JSON.
      const limitInfo = classifyQuotaError(
        quotaErr as { message?: string; details?: string },
        dailyCap ?? 0,
      );
      if (limitInfo) {
        logger.warn("profile_generation_rate_limit_exceeded", {
          request_id,
          trace_id,
          user_id: userId,
          plan,
          current_usage: limitInfo.used_today,
          limit: dailyCap ?? 0,
          event: "profile_generation_rate_limit_exceeded",
        });
        throw new ProfileGenLimitError({
          used_today: limitInfo.used_today,
          limit: dailyCap ?? 0,
          remaining: 0,
          reset_time: nextUtcMidnightIso(),
          plan,
          request_id,
          trace_id,
        });
      }
      throw new Error(`Quota check failed: ${quotaErr.message}`);
    }

    // Quota reserved. Now do the AI call. If the AI call fails, we do NOT
    // refund the slot: refunding would open a replay-attack window and the
    // rate limit is intentionally strict.
    const result = await callProfileAi(data, {
      key,
      onGatewayError: ({ status, detail }) =>
        logAiError(logger, {
          subsystem: "profile-generator",
          category: categorizeGatewayStatus(status),
          request_id,
          trace_id,
          user_id: userId,
          status,
          detail,
        }),
    });

    logger.info("profile_generation_success", {
      request_id,
      trace_id,
      user_id: userId,
      plan,
      used_today: (quotaRow as { used?: number } | null)?.used,
      limit: dailyCap,
      event: "profile_generation_success",
    });

    return result;
  });
