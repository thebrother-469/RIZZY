/**
 * Deterministic, idempotent staging seed.
 *
 * Usage (against a STAGING Supabase project only — never production):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/seed-staging.ts
 *
 * Creates three fixed auth users (Free / Pro / Elite) with:
 *   - profile row
 *   - subscription row aligned to their plan
 *   - one chat + one message
 *   - one pinned memory
 *   - one completed mission
 *   - user_xp + streaks bootstrapped by the handle_new_user trigger
 *
 * Re-running this script MUST be a no-op: users are looked up by email and
 * created only when missing; associated rows use upsert-on-conflict.
 */
import { createClient } from "@supabase/supabase-js";

type SeedPlan = "free" | "pro" | "elite";
type SeedUser = { email: string; password: string; plan: SeedPlan; displayName: string };

const USERS: SeedUser[] = [
  {
    email: "staging-free@rizzgod.test",
    password: "StagingFree!1",
    plan: "free",
    displayName: "Free Staging",
  },
  {
    email: "staging-pro@rizzgod.test",
    password: "StagingPro!1",
    plan: "pro",
    displayName: "Pro Staging",
  },
  {
    email: "staging-elite@rizzgod.test",
    password: "StagingElite!1",
    plan: "elite",
    displayName: "Elite Staging",
  },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Aborting.");
    process.exit(1);
  }
  if (/prod/i.test(process.env.SEED_ENV ?? "") || !/staging|dev|test/i.test(url)) {
    // Extra safety: require an explicit opt-in when the URL does not obviously
    // look like a non-production project.
    if (process.env.SEED_ALLOW_ANY !== "1") {
      console.error(
        "Refusing to seed: URL does not look like staging. Set SEED_ALLOW_ANY=1 to override.",
      );
      process.exit(1);
    }
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  for (const u of USERS) {
    // 1. Find or create auth user (idempotent).
    let userId: string | undefined;
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = existing?.users.find((x) => x.email === u.email)?.id;
    if (!userId) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { display_name: u.displayName },
      });
      if (error) throw error;
      userId = created.user?.id;
    }
    if (!userId) throw new Error(`failed to resolve user id for ${u.email}`);

    // 2. Profile (trigger creates the row; make sure display_name + onboarded_at are set).
    await admin
      .from("profiles")
      .upsert(
        { id: userId, display_name: u.displayName, onboarded_at: new Date().toISOString() },
        { onConflict: "id" },
      );

    // 3. Subscription pinned to the seeded plan.
    await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        plan: u.plan,
        status: u.plan === "free" ? "free" : "active",
        current_period_end: u.plan === "free" ? null : "2099-01-01T00:00:00Z",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    // 4. One chat + one message (dedup on deterministic id via lookup).
    const { data: chatRow } = await admin
      .from("chats")
      .select("id")
      .eq("user_id", userId)
      .eq("mode", "coach")
      .limit(1)
      .maybeSingle();
    let chatId = chatRow?.id;
    if (!chatId) {
      const { data: newChat } = await admin
        .from("chats")
        .insert({ user_id: userId, mode: "coach", title: "Seed conversation" })
        .select("id")
        .single();
      chatId = newChat?.id;
    }
    if (chatId) {
      const { data: msgRow } = await admin
        .from("messages")
        .select("id")
        .eq("chat_id", chatId)
        .eq("role", "user")
        .limit(1)
        .maybeSingle();
      if (!msgRow) {
        await admin.from("messages").insert({
          chat_id: chatId,
          user_id: userId,
          role: "user",
          content: "Seed opener — how do I text her back?",
        });
      }
    }

    // 5. Pinned memory (dedup by content).
    const { data: memRow } = await admin
      .from("memories")
      .select("id")
      .eq("user_id", userId)
      .eq("content", "Seed memory: she likes climbing.")
      .maybeSingle();
    if (!memRow) {
      await admin.from("memories").insert({
        user_id: userId,
        content: "Seed memory: she likes climbing.",
        pinned: true,
      });
    }

    // 6. Completed mission (dedup by title).
    const { data: missionRow } = await admin
      .from("missions")
      .select("id")
      .eq("user_id", userId)
      .eq("title", "Seed mission")
      .maybeSingle();
    if (!missionRow) {
      await admin.from("missions").insert({
        user_id: userId,
        title: "Seed mission",
        description: "Say hi first.",
        completed: true,
        completed_at: new Date().toISOString(),
      });
    }

    console.log(`seeded ${u.plan}: ${u.email} (${userId})`);
  }

  console.log("staging seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
