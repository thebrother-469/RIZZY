import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Award XP + badges are strictly server-side side-effects of authoritative
// actions (mission completion, onboarding). No client-callable award endpoints
// are exported, so users cannot self-award XP or badges by invoking RPCs.

async function awardXpServer(
  userId: string,
  eventType: "mission_completed" | "streak_day" | "onboarding_complete",
  meta: Record<string, unknown> | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("award_xp", {
    _event_type: eventType,
    _meta: (meta ?? null) as Database["public"]["Functions"]["award_xp"]["Args"]["_meta"],
    _caller_id: userId,
  });
  return data as { delta: number; newTotal: number; level: number } | null;
}

async function awardBadgeServer(userId: string, key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("award_badge", {
    _key: key,
    _caller_id: userId,
  });
  return data;
}

export const completeMissionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { missionId: string }) => {
    if (!UUID_RE.test(d.missionId)) throw new Error("invalid mission id");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("complete_mission", {
      _mission_id: data.missionId,
      _caller_id: context.userId,
    });
    if (error) throw error;
    const r = res as {
      updated: boolean;
      current_streak: number;
      longest_streak: number;
      streak_advanced: boolean;
    } | null;
    if (!r) return null;

    // Only award XP if the mission was actually toggled from incomplete → complete
    // by this call. Prevents XP farming via pre-inserted completed=true rows.
    if (!r.updated) return { ...r, xp: null };

    // Server-side awarded side effects. DB functions verify preconditions
    // and enforce idempotency, so re-plays are safe.
    const xp = await awardXpServer(context.userId, "mission_completed", {
      mission_id: data.missionId,
    });
    if (r.streak_advanced) await awardXpServer(context.userId, "streak_day", null);

    await awardBadgeServer(context.userId, "first_mission");
    if (r.current_streak >= 3) await awardBadgeServer(context.userId, "streak_3");
    if (r.current_streak >= 7) await awardBadgeServer(context.userId, "streak_7");
    if (r.current_streak >= 30) await awardBadgeServer(context.userId, "streak_30");
    if (xp && xp.level >= 5) await awardBadgeServer(context.userId, "level_5");
    if (xp && xp.level >= 10) await awardBadgeServer(context.userId, "level_10");

    return { ...r, xp };
  });

export const completeOnboardingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { correlationId?: string } | undefined) => {
    const cid = d?.correlationId;
    if (cid && !UUID_RE.test(cid)) throw new Error("invalid correlationId");
    return { correlationId: cid };
  })
  .handler(async ({ data, context }) => {
    const { emitDebugEvent, newCorrelationId } = await import("@/lib/observability");
    const cid = data.correlationId ?? newCorrelationId();
    const userId = context.userId;

    await emitDebugEvent({
      correlationId: cid,
      subsystem: "onboarding",
      event: "server.start",
      userId,
      payload: { hadClientCid: !!data.correlationId },
    });
    await emitDebugEvent({
      correlationId: cid,
      subsystem: "onboarding",
      event: "server.auth.verified",
      userId,
      success: true,
      payload: { userIdPresent: !!userId },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("onboarded_at, confidence_level, coaching_style, age_range, dating_experience")
      .eq("id", userId)
      .maybeSingle();
    await emitDebugEvent({
      correlationId: cid,
      subsystem: "onboarding",
      event: "server.profile.before",
      userId,
      success: !readErr,
      severity: readErr ? "error" : "info",
      payload: {
        onboarded_at: prof?.onboarded_at ?? null,
        has_confidence: prof?.confidence_level != null,
        has_coaching_style: !!prof?.coaching_style,
        has_age_range: !!prof?.age_range,
        has_dating_experience: !!prof?.dating_experience,
      },
      error: readErr,
    });
    if (readErr) throw readErr;
    if (!prof) throw new Error("Profile not found");

    if (!prof.onboarded_at) {
      const completedAt = new Date().toISOString();
      const {
        data: updatedProfile,
        error,
        count,
        status,
      } = await supabaseAdmin
        .from("profiles")
        .update({ onboarded_at: completedAt }, { count: "exact" })
        .eq("id", userId)
        .select("id, onboarded_at")
        .maybeSingle();
      const ok = !error && count === 1 && updatedProfile?.onboarded_at === completedAt;
      await emitDebugEvent({
        correlationId: cid,
        subsystem: "onboarding",
        event: "server.profile.update",
        userId,
        success: ok,
        severity: ok ? "info" : "error",
        payload: { status, count, onboarded_at: updatedProfile?.onboarded_at ?? null },
        error,
      });
      if (error) throw error;
      if (count !== 1 || !updatedProfile?.onboarded_at) {
        throw new Error("Onboarding completion was not persisted");
      }
    } else {
      await emitDebugEvent({
        correlationId: cid,
        subsystem: "onboarding",
        event: "server.profile.already_set",
        userId,
        success: true,
        payload: { onboarded_at: prof.onboarded_at },
      });
    }

    const completed =
      prof.confidence_level != null &&
      !!prof.coaching_style &&
      !!prof.age_range &&
      !!prof.dating_experience;

    let xp: { delta: number; newTotal: number; level: number } | null = null;
    if (completed) {
      xp = await awardXpServer(userId, "onboarding_complete", null);
    }
    await emitDebugEvent({
      correlationId: cid,
      subsystem: "onboarding",
      event: "server.award_xp",
      userId,
      success: true,
      payload: { gate_passed: completed, xp },
    });

    await emitDebugEvent({
      correlationId: cid,
      subsystem: "onboarding",
      event: "server.complete",
      userId,
      success: true,
      payload: { xpDelta: xp?.delta ?? 0 },
    });

    return { xp, correlationId: cid };
  });
