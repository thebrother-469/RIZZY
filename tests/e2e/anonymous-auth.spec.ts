/**
 * Regression: block anonymous sign-in.
 *
 * If Supabase re-enables anonymous auth (SUPA_auth_allow_anonymous_sign_ins),
 * this test fails immediately.
 */
import { test, expect } from "@playwright/test";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

test.describe("anonymous auth regression", () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, "supabase env not configured");

  test("anonymous sign-in must be disabled server-side", async ({ request }) => {
    const res = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
      data: {}, // empty body = Supabase anonymous sign-in path
    });
    expect(res.status(), await res.text()).toBeGreaterThanOrEqual(400);
  });
});
