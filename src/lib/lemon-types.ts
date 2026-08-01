/**
 * Minimal structural types for the LemonSqueezy REST API and webhook payloads.
 * Only the fields this app reads are modelled; everything else stays untyped
 * on purpose so upstream additions never break the build.
 */

export interface LemonSubscriptionAttributes {
  status?: string;
  variant_id?: string | number;
  renews_at?: string | null;
  ends_at?: string | null;
  customer_id?: string | number;
  updated_at?: string | null;
  created_at?: string | null;
  user_email?: string | null;
}

export interface LemonSubscriptionResponse {
  data?: {
    id?: string;
    attributes?: LemonSubscriptionAttributes;
  };
}

export interface LemonCheckoutResponse {
  data?: {
    attributes?: { url?: string };
  };
}

export interface LemonWebhookEvent {
  meta?: {
    event_name?: string;
    webhook_id?: string;
    event_id?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    id?: string;
    attributes?: LemonSubscriptionAttributes;
  };
}
