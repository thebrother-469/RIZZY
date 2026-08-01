import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logger } from "@/lib/structured-logger";

/**
 * Schema validation for Lemon Squeezy subscription response.
 * Ensures portal URL is available before returning to client.
 */
interface LemonSubscriptionData {
  data?: {
    attributes?: {
      urls?: {
        customer_portal?: string;
      };
    };
  };
}

function validateLemonResponse(payload: unknown): payload is LemonSubscriptionData {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const data = p.data;
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const attrs = d.attributes;
  if (!attrs || typeof attrs !== "object") return false;
  const a = attrs as Record<string, unknown>;
  const urls = a.urls;
  if (!urls || typeof urls !== "object") return false;
  const u = urls as Record<string, unknown>;
  // urls.customer_portal must be a non-empty string
  return typeof u.customer_portal === "string" && u.customer_portal.length > 0;
}

function extractPortalUrl(payload: LemonSubscriptionData): string {
  return payload.data?.attributes?.urls?.customer_portal ?? "";
}

// Returns a signed Lemon Squeezy customer portal URL for the current user.
// The URL comes from the subscription resource itself (attributes.urls.customer_portal),
// which lets the user manage payment method, invoices, cancel, resume, and change plan.
export const getCustomerPortalUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
      logger.error("billing_not_configured", {
        event: "billing_not_configured",
        user_id: context.userId,
      });
      throw new Error("Billing not configured");
    }

    const { data: sub, error } = await context.supabase
      .from("subscriptions")
      .select("lemonsqueezy_subscription_id, plan")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) {
      logger.error("billing_subscription_query_failed", {
        event: "billing_subscription_query_failed",
        user_id: context.userId,
        error: error.message,
      });
      throw new Error("Failed to load subscription");
    }

    const subId = sub?.lemonsqueezy_subscription_id;
    if (!subId) {
      logger.warn("billing_no_active_subscription", {
        event: "billing_no_active_subscription",
        user_id: context.userId,
      });
      throw new Error("No active subscription to manage");
    }

    const res = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subId}`, {
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const responseText = await res.text().catch(() => "");
      logger.error("billing_lemon_api_failed", {
        event: "billing_lemon_api_failed",
        user_id: context.userId,
        subscription_id: subId,
        status: res.status,
        response: responseText.slice(0, 500), // Log first 500 chars to avoid excessive log size
      });
      throw new Error(`Billing provider error (${res.status})`);
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (parseErr) {
      logger.error("billing_lemon_parse_failed", {
        event: "billing_lemon_parse_failed",
        user_id: context.userId,
        subscription_id: subId,
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      throw new Error("Billing provider returned invalid response", { cause: parseErr });
    }

    if (!validateLemonResponse(payload)) {
      logger.error("billing_lemon_invalid_schema", {
        event: "billing_lemon_invalid_schema",
        user_id: context.userId,
        subscription_id: subId,
        payload_keys:
          payload && typeof payload === "object" ? Object.keys(payload as object) : "invalid",
      });
      throw new Error("Portal URL unavailable from billing provider");
    }

    const url = extractPortalUrl(payload);
    if (!url) {
      logger.error("billing_lemon_missing_portal_url", {
        event: "billing_lemon_missing_portal_url",
        user_id: context.userId,
        subscription_id: subId,
      });
      throw new Error("Portal URL unavailable from billing provider");
    }

    logger.info("billing_portal_url_retrieved", {
      event: "billing_portal_url_retrieved",
      user_id: context.userId,
    });

    return { url };
  });
