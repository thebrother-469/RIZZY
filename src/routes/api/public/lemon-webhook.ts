import { createFileRoute } from "@tanstack/react-router";
import { verifyLemonSignature, resolvePlanFromVariant } from "@/lib/lemon";
import type { LemonWebhookEvent } from "@/lib/lemon-types";
import { errorCode } from "@/lib/errors";

// Lemon Squeezy webhook. Verifies the `X-Signature` HMAC header, then maps
// subscription lifecycle events to the app's `subscriptions` table.
// Only this verified handler writes plan changes — the browser cannot.

type Plan = import("@/lib/lemon").Plan;

export const Route = createFileRoute("/api/public/lemon-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        const proVariant = process.env.LEMONSQUEEZY_PRO_VARIANT_ID ?? "";
        const eliteVariant = process.env.LEMONSQUEEZY_ELITE_VARIANT_ID ?? "";
        if (!secret) return new Response("Webhook not configured", { status: 500 });

        const sigHeader = request.headers.get("x-signature") ?? "";
        const raw = await request.text();
        if (!verifyLemonSignature(sigHeader, raw, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let evt: LemonWebhookEvent;
        try {
          evt = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const eventName: string = evt?.meta?.event_name ?? "";
        const customData = evt?.meta?.custom_data ?? {};
        const data = evt?.data ?? {};
        const attrs = data?.attributes ?? {};
        const eventId: string | undefined =
          evt?.meta?.webhook_id ?? evt?.meta?.event_id ?? undefined;

        // Only subscription lifecycle events change plan state.
        if (!eventName.startsWith("subscription_")) {
          return new Response("ok", { status: 200 });
        }

        // Idempotency: unique constraint on event_id rejects duplicates.
        if (eventId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: dupErr } = await supabaseAdmin
            .from("lemonsqueezy_webhook_events" as never)
            .insert({
              event_id: eventId,
              event_type: eventName,
              occurred_at: attrs?.updated_at ?? attrs?.created_at ?? null,
            } as never);
          if (dupErr) {
            if (errorCode(dupErr) === "23505") return new Response("ok", { status: 200 });
            console.error("[lemon-webhook] idempotency insert failed", dupErr);
            return new Response("DB error", { status: 500 });
          }
        }

        // Resolve target plan from variant id + subscription status.
        const variantId = String(attrs?.variant_id ?? "");
        const status: string = attrs?.status ?? "";
        const plan: Plan = resolvePlanFromVariant(variantId, status, { proVariant, eliteVariant });

        const lsCustomerId: string | undefined =
          attrs?.customer_id != null ? String(attrs.customer_id) : undefined;
        const lsSubId: string | undefined = data?.id != null ? String(data.id) : undefined;
        const currentPeriodEnd: string | null = attrs?.renews_at ?? null;
        const cancelAt: string | null = attrs?.ends_at ?? null;

        // Prefer user_id from custom_data (bound at checkout). Fall back to
        // an existing mapping via lemonsqueezy_subscription_id for later events.
        let userId: string | undefined =
          typeof customData?.user_id === "string" ? customData.user_id : undefined;

        if (!userId && lsSubId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: existing } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id")
            .eq("lemonsqueezy_subscription_id", lsSubId)
            .maybeSingle();
          if (existing?.user_id) userId = existing.user_id;
        }

        if (!userId) {
          console.warn("[lemon-webhook] event missing custom_data.user_id", eventName, lsSubId);
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Staleness guard: never overwrite a row updated after this event.
        const eventTs = attrs?.updated_at ?? attrs?.created_at ?? null;
        const { data: existingRow } = await supabaseAdmin
          .from("subscriptions")
          .select("updated_at, plan, status, current_period_end, cancel_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (
          existingRow?.updated_at &&
          eventTs &&
          new Date(existingRow.updated_at).getTime() > new Date(eventTs).getTime()
        ) {
          console.log("[lemon-webhook] skipping stale event", eventName, lsSubId);
          return new Response("ok", { status: 200 });
        }

        const { error } = await supabaseAdmin.from("subscriptions").upsert(
          {
            user_id: userId,
            plan,
            status: status || "unknown",
            current_period_end: currentPeriodEnd,
            cancel_at: cancelAt,
            lemonsqueezy_customer_id: lsCustomerId ?? null,
            lemonsqueezy_subscription_id: lsSubId ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (error) {
          console.error("[lemon-webhook] upsert failed", error);
          return new Response("DB error", { status: 500 });
        }
        console.log("[lemon-webhook] applied", { eventName, userId, plan, status });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
