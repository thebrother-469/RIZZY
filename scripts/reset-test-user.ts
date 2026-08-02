#!/usr/bin/env bun
/**
 * Resets or destroys an E2E Auth user and its owned rows.
 *
 *   bun run e2e:reset-user                  # wipes owned data, keeps the account
 *   bun run e2e:reset-user --destroy        # additionally deletes the Auth user
 *   bun run e2e:reset-user --email a@b.c    # target an explicit account
 *
 * Data cleanup runs with the service role via PostgREST, deleting only rows
 * owned by that user id, plus the user's objects in the private `uploads`
 * bucket. Never touches other accounts. Exits 0 (NOT VERIFIED) when the
 * service key is not bound.
 */
import { resolveEnv, missing, findUserByEmail, deleteUser, type E2EEnv } from "./e2e-env";

/** Tables the E2E user owns, ordered so children are removed before parents. */
const OWNED_TABLES = [
  "messages",
  "chats",
  "memories",
  "missions",
  "xp_events",
  "badges",
  "profile_gen_usage",
  "usage_daily",
] as const;

async function rest(e: E2EEnv, path: string, init: RequestInit = {}) {
  const res = await fetch(`${e.url!.replace(/\/$/, "")}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: e.serviceKey!,
      Authorization: `Bearer ${e.serviceKey!}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(init.headers ?? {}),
    },
  });
  return res.status;
}

async function purgeStorage(e: E2EEnv, userId: string): Promise<number> {
  const listRes = await fetch(`${e.url!.replace(/\/$/, "")}/storage/v1/object/list/uploads`, {
    method: "POST",
    headers: {
      apikey: e.serviceKey!,
      Authorization: `Bearer ${e.serviceKey!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: `${userId}/`, limit: 1000 }),
  });
  if (!listRes.ok) return 0;
  const objects = (await listRes.json().catch(() => [])) as { name?: string }[];
  const prefixes = objects.filter((o) => o.name).map((o) => `${userId}/${o.name}`);
  if (!prefixes.length) return 0;
  await fetch(`${e.url!.replace(/\/$/, "")}/storage/v1/object/uploads`, {
    method: "DELETE",
    headers: {
      apikey: e.serviceKey!,
      Authorization: `Bearer ${e.serviceKey!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes }),
  });
  return prefixes.length;
}

export async function resetTestUser(opts: { email?: string; destroy?: boolean } = {}) {
  const e = resolveEnv();
  const email = opts.email ?? e.email;
  const need = missing(e, ["url", "serviceKey"]);
  if (need.length || !email) {
    return {
      status: "NOT VERIFIED" as const,
      detail: `Cannot reset; missing ${[...need, email ? null : "E2E_TEST_USER_EMAIL"].filter(Boolean).join(", ")}.`,
    };
  }
  const user = await findUserByEmail(e, email);
  if (!user) {
    return { status: "PASS" as const, detail: "No matching Auth user; nothing to reset." };
  }

  const cleaned: Record<string, number> = {};
  for (const table of OWNED_TABLES) {
    cleaned[table] = await rest(e, `/${table}?user_id=eq.${user.id}`, { method: "DELETE" });
  }
  // Reset the aggregate rows the signup trigger owns rather than deleting them.
  await rest(e, `/user_xp?user_id=eq.${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ total_xp: 0, level: 1, xp_into_level: 0 }),
  });
  await rest(e, `/streaks?user_id=eq.${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ current_streak: 0, longest_streak: 0, last_action_date: null }),
  });
  await rest(e, `/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ onboarded_at: null }),
  });
  const storageObjects = await purgeStorage(e, user.id);

  if (opts.destroy) {
    const status = await deleteUser(e, user.id);
    return {
      status: status < 400 ? ("PASS" as const) : ("FAIL" as const),
      userId: user.id,
      cleaned,
      storageObjects,
      detail:
        status < 400
          ? "User data purged and Auth user deleted."
          : `Delete failed (HTTP ${status}).`,
    };
  }
  return {
    status: "PASS" as const,
    userId: user.id,
    cleaned,
    storageObjects,
    detail: "User data purged; Auth account retained.",
  };
}

if (import.meta.main) {
  const emailIdx = process.argv.indexOf("--email");
  const res = await resetTestUser({
    email: emailIdx > -1 ? process.argv[emailIdx + 1] : undefined,
    destroy: process.argv.includes("--destroy"),
  });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.status === "FAIL" ? 1 : 0);
}
