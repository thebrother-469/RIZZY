import { createHmac } from "node:crypto";

export const TEST_SECRET = "whsec_test_secret_do_not_use_in_prod";
export const PRO_VARIANT = "111111";
export const ELITE_VARIANT = "222222";

export function sign(body: string, secret = TEST_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function subscriptionEvent(
  overrides: {
    eventName?: string;
    eventId?: string;
    userId?: string;
    variantId?: string;
    status?: string;
    subscriptionId?: string;
    customerId?: string;
    updatedAt?: string;
    createdAt?: string;
    renewsAt?: string | null;
    endsAt?: string | null;
  } = {},
) {
  return {
    meta: {
      event_name: overrides.eventName ?? "subscription_created",
      webhook_id: overrides.eventId ?? "evt_" + Math.random().toString(36).slice(2),
      custom_data: { user_id: overrides.userId ?? "00000000-0000-0000-0000-000000000001" },
    },
    data: {
      id: overrides.subscriptionId ?? "sub_1001",
      attributes: {
        variant_id: overrides.variantId ?? PRO_VARIANT,
        status: overrides.status ?? "active",
        customer_id: overrides.customerId ?? "cus_1",
        renews_at: overrides.renewsAt ?? "2099-01-01T00:00:00.000Z",
        ends_at: overrides.endsAt ?? null,
        updated_at: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
        created_at: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
      },
    },
  };
}
