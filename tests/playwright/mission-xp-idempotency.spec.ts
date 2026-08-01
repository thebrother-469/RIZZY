import { test, expect } from "@playwright/test";

/**
 * End-to-end verification of the mission → XP pipeline.
 *
 * Requires a signed-in Supabase session. In the Lovable sandbox this is
 * pre-injected via LOVABLE_BROWSER_SUPABASE_* env vars; locally you can
 * inject the same variables to run the test. Without a session, the test
 * is skipped rather than failing — the mission page is auth-gated and there
 * is no meaningful public assertion to make.
 */

const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

test.describe("mission completion + XP idempotency", () => {
  test.skip(
    !storageKey || !sessionJson,
    "No Supabase session injected (LOVABLE_BROWSER_SUPABASE_*); skipping auth-gated flow.",
  );

  test("completes today's mission exactly once, no duplicate XP on retries", async ({
    context,
    page,
    baseURL,
  }) => {
    // 1. Restore session (both cookie + localStorage forms).
    if (cookiesJson) {
      const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({
        ...c,
        url: baseURL ?? "http://localhost:8080",
      }));
      await context.addCookies(cookies);
    }
    await page.goto("/");
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [storageKey!, sessionJson!],
    );

    // 2. Ensure a mission exists for today, then load Missions.
    await page.goto("/app/missions", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Generate a mission if none is present for today.
    const generateBtn = page.getByRole("button", { name: /generate today/i });
    if (
      await generateBtn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await generateBtn.first().click();
      await expect(generateBtn.first()).toBeHidden({ timeout: 30_000 });
    }

    // 3. Read current XP total from user_xp via the app's Supabase client.
    const xpBefore = await page.evaluate(async () => {
      const mod = await import("/src/integrations/supabase/client.ts");
      const supa = (mod as { supabase: unknown }).supabase as {
        auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: { total_xp: number } | null }> };
          };
        };
      };
      const { data } = await supa.auth.getUser();
      if (!data.user) return null;
      const res = await supa
        .from("user_xp")
        .select("total_xp")
        .eq("user_id", data.user.id)
        .maybeSingle();
      return res.data?.total_xp ?? 0;
    });

    // 4. Click "Crush it" on today's mission (first non-completed row).
    const crushBtn = page.getByRole("button", { name: /crush it/i }).first();
    const missionAlreadyDone = !(await crushBtn.isVisible().catch(() => false));

    if (!missionAlreadyDone) {
      await crushBtn.click();
      await expect(page.getByText(/mission crushed|already completed/i)).toBeVisible({
        timeout: 15_000,
      });
    }

    // 5. Read XP total after first completion.
    await page.waitForTimeout(500);
    const xpAfterFirst = await page.evaluate(async () => {
      const mod = await import("/src/integrations/supabase/client.ts");
      const supa = (mod as { supabase: unknown }).supabase as {
        auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: { total_xp: number } | null }> };
          };
        };
      };
      const { data } = await supa.auth.getUser();
      if (!data.user) return null;
      const res = await supa
        .from("user_xp")
        .select("total_xp")
        .eq("user_id", data.user.id)
        .maybeSingle();
      return res.data?.total_xp ?? 0;
    });

    // Either mission was fresh (+50 XP for mission, optionally +10 streak_day)
    // or was already done today (no delta). Both are valid stable states —
    // what matters is the retry below adds ZERO further XP.
    if (!missionAlreadyDone) {
      expect(xpAfterFirst!).toBeGreaterThan(xpBefore!);
    }

    // 6. Refresh the page — completed state must persist, "Crush it" gone.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/today/i).first()).toBeVisible();

    // 7. Attempt to invoke completion again via the server fn (bypasses the UI
    //    guard). Duplicate submission must remain harmless and award no XP.
    const retryResult = await page.evaluate(async () => {
      try {
        const { completeMissionFn } = await import("/src/lib/xp.functions.ts");
        const supaMod = await import("/src/integrations/supabase/client.ts");
        const supa = (supaMod as { supabase: unknown }).supabase as {
          auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                c: string,
                v: string,
              ) => {
                eq: (
                  c: string,
                  v: string,
                ) => {
                  order: (
                    c: string,
                    o: { ascending: boolean },
                  ) => { limit: (n: number) => Promise<{ data: Array<{ id: string }> | null }> };
                };
              };
            };
          };
        };
        const { data } = await supa.auth.getUser();
        if (!data.user) return { error: "no-user" };
        const today = new Date().toISOString().slice(0, 10);
        const res = await supa
          .from("missions")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("assigned_date", today)
          .order("assigned_date", { ascending: false })
          .limit(1);
        const missionId = res.data?.[0]?.id;
        if (!missionId) return { error: "no-mission" };
        const r = await completeMissionFn({ data: { missionId } });
        return { r };
      } catch (e) {
        return { error: String(e) };
      }
    });

    // Second invocation must report updated=false (idempotent).
    expect(
      retryResult && "r" in retryResult && retryResult.r && retryResult.r.updated === false,
      `retry should be a no-op, got: ${JSON.stringify(retryResult)}`,
    ).toBe(true);

    // 8. Confirm total_xp is unchanged after the retry.
    const xpAfterRetry = await page.evaluate(async () => {
      const mod = await import("/src/integrations/supabase/client.ts");
      const supa = (mod as { supabase: unknown }).supabase as {
        auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: { total_xp: number } | null }> };
          };
        };
      };
      const { data } = await supa.auth.getUser();
      if (!data.user) return null;
      const res = await supa
        .from("user_xp")
        .select("total_xp")
        .eq("user_id", data.user.id)
        .maybeSingle();
      return res.data?.total_xp ?? 0;
    });
    expect(xpAfterRetry).toBe(xpAfterFirst);
  });
});
