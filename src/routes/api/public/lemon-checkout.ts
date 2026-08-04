import { createFileRoute } from "@tanstack/react-router";
import type { LemonCheckoutResponse } from "@/lib/lemon-types";

// Creates a Lemon Squeezy hosted checkout URL for the authenticated user.
// The user's Supabase UUID + selected plan are embedded in `checkout_data.custom`
// so the webhook can bind the resulting subscription to the correct account.

export const Route = createFileRoute("/api/public/lemon-checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
        const apiKey = process.env.LEMONSQUEEZY_API_KEY;
        const storeId = process.env.LEMONSQUEEZY_STORE_ID;
        const proVariant = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;
        const eliteVariant = process.env.LEMONSQUEEZY_ELITE_VARIANT_ID;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const missing: string[] = [];
        if (!apiKey) missing.push("LEMONSQUEEZY_API_KEY");
        if (!storeId) missing.push("LEMONSQUEEZY_STORE_ID");
        if (!proVariant) missing.push("LEMONSQUEEZY_PRO_VARIANT_ID");
        if (!eliteVariant) missing.push("LEMONSQUEEZY_ELITE_VARIANT_ID");
        if (!SUPABASE_URL) missing.push("SUPABASE_URL");
        if (!SUPABASE_PUBLISHABLE_KEY) missing.push("SUPABASE_PUBLISHABLE_KEY");
        if (missing.length) {
          console.error("[lemon-checkout] missing env", missing);
          return Response.json({ error: "billing_unavailable", message: "Billing is temporarily unavailable." }, {
            status: 503,
          });
        }

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return Response.json({ error: "unauthorized", message: "Authentication is required." }, { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length);
        if (!token || token.split(".").length !== 3) {
          return Response.json({ error: "unauthorized", message: "Authentication is required." }, { status: 401 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
          global: {
            headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY! },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) {
          return Response.json({ error: "unauthorized", message: "Authentication is required." }, { status: 401 });
        }

        let body: Record<string, unknown> = {};
        try {
          body = await request.json();
        } catch {
          /* ignore */
        }
        const plan: "pro" | "elite" | null =
          body?.plan === "elite" ? "elite" : body?.plan === "pro" ? "pro" : null;
        const returnUrl: string | undefined =
          typeof body?.returnUrl === "string" ? body.returnUrl : undefined;
        if (!plan) {
          return Response.json({ error: "invalid_plan", message: "Select a valid billing plan." }, { status: 400 });
        }

        const variantId = plan === "elite" ? eliteVariant : proVariant;
        const origin = new URL(request.url).origin;
        const successUrl =
          returnUrl && returnUrl.startsWith(origin) ? returnUrl : `${origin}/app?upgraded=${plan}`;

        const lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
          method: "POST",
          headers: {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            data: {
              type: "checkouts",
              attributes: {
                checkout_data: {
                  email: userData.user.email ?? undefined,
                  custom: { user_id: userData.user.id, plan },
                },
                product_options: {
                  redirect_url: successUrl,
                  receipt_button_text: "Return to RizzGod",
                  receipt_link_url: successUrl,
                },
                checkout_options: {
                  embed: false,
                  dark: true,
                },
              },
              relationships: {
                store: { data: { type: "stores", id: String(storeId) } },
                variant: { data: { type: "variants", id: String(variantId) } },
              },
            },
          }),
        });

        if (!lsRes.ok) {
          const errText = await lsRes.text().catch(() => "");
          console.error("[lemon-checkout] LS API failed", lsRes.status, errText);
          return Response.json({ error: "checkout_provider_error", message: "Checkout could not be started." }, { status: 502 });
        }
        const payload = (await lsRes.json()) as LemonCheckoutResponse;
        const url: string | undefined = payload?.data?.attributes?.url;
        if (!url) {
          console.error("[lemon-checkout] missing checkout url", payload);
          return Response.json({ error: "checkout_provider_error", message: "Checkout could not be started." }, { status: 502 });
        }
        return Response.json({ url });
        } catch (error) {
          console.error("[lemon-checkout] unexpected failure", error);
          return Response.json(
            { error: "checkout_unavailable", message: "Checkout is temporarily unavailable." },
            { status: 503 },
          );
        }
      },
    },
  },
});
