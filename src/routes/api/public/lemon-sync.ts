import { createFileRoute } from "@tanstack/react-router";
import type { LemonSubscriptionResponse } from "@/lib/lemon-types";

// Scheduled reconciliation: pulls fresh state for every subscription that
// has a lemonsqueezy_subscription_id and repairs missed webhook events.
// Idempotent — only writes rows whose plan/status/period/cancel_at actually changed,
// and never overwrites a locally newer updated_at.
//
// Auth: requires `Authorization: Bearer <LEMON_SYNC_CRON_SECRET>` — a dedicated
// server-only cron secret compared with a timing-safe check. The Supabase anon
// key is NOT accepted (it ships in the client bundle and is not a secret).

type Plan = "free" | "pro" | "elite";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/lemon-sync")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const apiKey = process.env.LEMONSQUEEZY_API_KEY;
        const proVariant = process.env.LEMONSQUEEZY_PRO_VARIANT_ID ?? "";
        const eliteVariant = process.env.LEMONSQUEEZY_ELITE_VARIANT_ID ?? "";
        const cronSecret = process.env.LEMON_SYNC_CRON_SECRET;
        if (!apiKey || !cronSecret) return new Response("Not configured", { status: 500 });

        const authHeader = request.headers.get("authorization") ?? "";
        const provided = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        if (!provided || !timingSafeEqualStr(provided, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("subscriptions")
          .select(
            "user_id, plan, status, current_period_end, cancel_at, updated_at, lemonsqueezy_subscription_id, lemonsqueezy_customer_id",
          )
          .not("lemonsqueezy_subscription_id", "is", null);
        if (error) {
          console.error("[lemon-sync] list failed", error);
          return new Response("DB error", { status: 500 });
        }

        const activeStatuses = new Set(["active", "on_trial", "past_due", "paused"]);
        let checked = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;

        for (const row of rows ?? []) {
          checked++;
          const subId = row.lemonsqueezy_subscription_id!;
          const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subId}`, {
            headers: {
              Accept: "application/vnd.api+json",
              Authorization: `Bearer ${apiKey}`,
            },
          });
          if (!res.ok) {
            // 404: subscription deleted at LS → downgrade to free.
            if (res.status === 404) {
              const { error: dErr } = await supabaseAdmin
                .from("subscriptions")
                .update({
                  plan: "free",
                  status: "deleted",
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", row.user_id);
              if (dErr) failed++;
              else updated++;
              continue;
            }
            failed++;
            console.error("[lemon-sync] LS fetch failed", subId, res.status);
            continue;
          }
          const body = (await res.json()) as LemonSubscriptionResponse;
          const attrs = body?.data?.attributes ?? {};
          const status: string = attrs?.status ?? "unknown";
          const variantId = String(attrs?.variant_id ?? "");
          const currentPeriodEnd: string | null = attrs?.renews_at ?? null;
          const cancelAt: string | null = attrs?.ends_at ?? null;
          const lsCustomerId: string | null =
            attrs?.customer_id != null ? String(attrs.customer_id) : null;
          const lsUpdatedAt: string | null = attrs?.updated_at ?? null;

          let plan: Plan = "free";
          if (activeStatuses.has(status)) {
            if (variantId === eliteVariant) plan = "elite";
            else if (variantId === proVariant) plan = "pro";
          }

          // Staleness guard: local row is newer than LS payload.
          if (
            row.updated_at &&
            lsUpdatedAt &&
            new Date(row.updated_at).getTime() > new Date(lsUpdatedAt).getTime()
          ) {
            skipped++;
            continue;
          }

          const changed =
            row.plan !== plan ||
            row.status !== status ||
            row.current_period_end !== currentPeriodEnd ||
            row.cancel_at !== cancelAt;
          if (!changed) {
            skipped++;
            continue;
          }

          const { error: uErr } = await supabaseAdmin
            .from("subscriptions")
            .update({
              plan,
              status,
              current_period_end: currentPeriodEnd,
              cancel_at: cancelAt,
              lemonsqueezy_customer_id: lsCustomerId,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", row.user_id);
          if (uErr) {
            failed++;
            console.error("[lemon-sync] update failed", row.user_id, uErr);
          } else {
            updated++;
          }
        }

        console.log("[lemon-sync] done", { checked, updated, skipped, failed });
        return Response.json({ checked, updated, skipped, failed });
      },
    },
  },
});
