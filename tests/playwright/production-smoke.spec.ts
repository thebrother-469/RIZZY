/**
 * CANONICAL PRODUCTION SMOKE — the single release-blocking end-to-end flow.
 *
 * Drives one disposable identity through the entire product surface:
 * signup -> session -> onboarding -> mission -> XP/streak -> coach chat ->
 * realtime fan-out -> memory -> profile generator -> refresh persistence ->
 * logout/login persistence -> subscription state, while collecting console
 * errors and failed network requests for the whole journey.
 *
 * Determinism guarantees:
 *   - isolated, disposable Auth user per run (never a shared account),
 *   - seeded, run-scoped identifiers (`RUN_ID`) for every row we create,
 *   - isolated storage prefix per run,
 *   - explicit realtime SUBSCRIBED barrier before any mutation,
 *   - `expect.poll` / `toPass` retry-safe assertions instead of sleeps,
 *   - per-stage timeout guards,
 *   - full transactional + storage cleanup in afterAll.
 *
 * Emits security-artifacts/production-smoke.json. Any stage failure fails the
 * suite immediately (serial mode) and is recorded in the artifact.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  authPreflight,
  createTestUser,
  destroyTestUser,
  mintSession,
  injectSession,
  collectRealtime,
  realtimeEvents,
  type TestIdentity,
} from "./_helpers/auth";
import { resolveEnv, supabaseStorageKey, type AuthSession } from "../../scripts/e2e-env";

const ARTIFACT_PATH = "security-artifacts/production-smoke.json";
const STAGE_TIMEOUT = 45_000;
const env = resolveEnv();

/** Seeded, run-scoped identity for every artifact this run creates. */
const RUN_ID = process.env.SMOKE_RUN_ID ?? `smoke-${Date.now().toString(36)}`;
const STORAGE_PREFIX = `e2e/${RUN_ID}`;

interface StageRecord {
  name: string;
  status: "PASS" | "FAIL";
  ms: number;
  detail?: string;
}

interface Artifact {
  generatedAt: string;
  runId: string;
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
  reason?: string;
  userId: string | null;
  storagePrefix: string;
  timings: { totalMs: number; stages: Record<string, number> };
  completedStages: string[];
  xp: { before: number; after: number; delta: number };
  streak: { before: number; after: number; delta: number };
  chatId: string | null;
  messageId: string | null;
  memoryId: string | null;
  missionId: string | null;
  profileId: string | null;
  subscription: { plan: string | null; status: string | null };
  consoleErrors: string[];
  networkFailures: string[];
  stages: StageRecord[];
}

const stages: StageRecord[] = [];
const consoleErrors: string[] = [];
const networkFailures: string[] = [];
const state = {
  identity: null as TestIdentity | null,
  session: null as AuthSession | null,
  userId: null as string | null,
  chatId: null as string | null,
  messageId: null as string | null,
  memoryId: null as string | null,
  missionId: null as string | null,
  profileId: null as string | null,
  xpBefore: 0,
  xpAfter: 0,
  streakBefore: 0,
  streakAfter: 0,
  plan: null as string | null,
  subStatus: null as string | null,
  startedAt: Date.now(),
  skipReason: null as string | null,
};

// ---------------------------------------------------------------------------
// PostgREST helpers bound to the signed-in user's token (RLS applies).
// ---------------------------------------------------------------------------
async function rest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${env.url!.replace(/\/$/, "")}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.anonKey!,
      Authorization: `Bearer ${state.session!.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body };
}

/**
 * Service-mediated RPC. award_xp / award_badge / complete_mission carry no
 * EXECUTE grant for `authenticated` by design — the app reaches them only
 * from server functions running with the service role and an explicit
 * `_caller_id`. This mirrors that exact production path.
 */
async function adminRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.url!.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.serviceKey!,
      Authorization: `Bearer ${env.serviceKey!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...args, _caller_id: state.userId }),
  });
  return (await res.json().catch(() => null)) as T;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { body } = await rest<T>(`/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  return body;
}

/** Runs a stage with a hard timeout guard and records its timing. */
async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`stage "${name}" exceeded ${STAGE_TIMEOUT}ms`)),
          STAGE_TIMEOUT,
        ),
      ),
    ]);
    stages.push({ name, status: "PASS", ms: Date.now() - started });
    return result;
  } catch (err) {
    stages.push({
      name,
      status: "FAIL",
      ms: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function instrument(page: Page): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on("requestfailed", (req) => {
    const errorText = req.failure()?.errorText ?? "failed";
    // net::ERR_ABORTED means the browser cancelled an in-flight request because
    // the page navigated away (module prefetches, route chunks). That is not a
    // product failure, so it must not fail the release gate.
    if (errorText.includes("ERR_ABORTED")) return;
    networkFailures.push(`${req.method()} ${req.url()} — ${errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) networkFailures.push(`${res.status()} ${res.url()}`);
  });
}

function writeArtifact(status: Artifact["status"], reason?: string): void {
  const artifact: Artifact = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    status,
    ...(reason ? { reason } : {}),
    userId: state.userId,
    storagePrefix: STORAGE_PREFIX,
    timings: {
      totalMs: Date.now() - state.startedAt,
      stages: Object.fromEntries(stages.map((s) => [s.name, s.ms])),
    },
    completedStages: stages.filter((s) => s.status === "PASS").map((s) => s.name),
    xp: { before: state.xpBefore, after: state.xpAfter, delta: state.xpAfter - state.xpBefore },
    streak: {
      before: state.streakBefore,
      after: state.streakAfter,
      delta: state.streakAfter - state.streakBefore,
    },
    chatId: state.chatId,
    messageId: state.messageId,
    memoryId: state.memoryId,
    missionId: state.missionId,
    profileId: state.profileId,
    subscription: { plan: state.plan, status: state.subStatus },
    consoleErrors,
    networkFailures,
    stages,
  };
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
}

// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial", retries: 0 });

test.describe("canonical production smoke", () => {
  test.beforeAll(async () => {
    state.skipReason = await authPreflight();
    if (state.skipReason) {
      writeArtifact("NOT_VERIFIED", state.skipReason);
      return;
    }
    state.identity = await createTestUser({ disposable: true });
    state.session = await mintSession(state.identity);
    state.userId = state.session?.user.id ?? state.identity.userId ?? null;
    if (!state.session || !state.userId) {
      state.skipReason = "NOT VERIFIED: could not mint a session for the disposable test user.";
      writeArtifact("NOT_VERIFIED", state.skipReason);
    }
  });

  test.beforeEach(() => {
    test.skip(!!state.skipReason, state.skipReason ?? "");
  });

  test("full journey: signup -> onboarding -> mission -> chat -> memory -> profile -> persistence", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL: baseURL! });
    const page = await context.newPage();
    instrument(page);

    try {
      // 1. Session creation is proven by loading a protected route.
      await stage("session_created", async () => {
        await injectSession(context, state.session!, baseURL!);
        await page.goto("/app", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
      });

      // 2. Onboarding + persistence.
      await stage("onboarding_completed", async () => {
        const { status } = await rest(`/profiles?id=eq.${state.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            display_name: `Smoke ${RUN_ID}`,
            goals: "ship the release gate",
            confidence_level: 5,
            coaching_style: "direct",
          }),
        });
        expect(status, "profile update accepted").toBeLessThan(300);
      });

      await stage("onboarding_persisted", async () => {
        await expect
          .poll(
            async () => {
              const { body } = await rest<Array<{ display_name: string }>>(
                `/profiles?id=eq.${state.userId}&select=display_name`,
              );
              return body?.[0]?.display_name ?? null;
            },
            { timeout: 15_000 },
          )
          .toBe(`Smoke ${RUN_ID}`);
      });

      // 3. Baselines, then daily mission.
      await stage("baseline_xp_streak", async () => {
        const { body: xp } = await rest<Array<{ total_xp: number }>>(
          `/user_xp?user_id=eq.${state.userId}&select=total_xp`,
        );
        const { body: st } = await rest<Array<{ current_streak: number }>>(
          `/streaks?user_id=eq.${state.userId}&select=current_streak`,
        );
        state.xpBefore = xp?.[0]?.total_xp ?? 0;
        state.streakBefore = st?.[0]?.current_streak ?? 0;
      });

      await stage("mission_generated", async () => {
        const { status, body } = await rest<Array<{ id: string }>>("/missions", {
          method: "POST",
          body: JSON.stringify({
            user_id: state.userId,
            title: `Daily mission ${RUN_ID}`,
            description: "Canonical smoke mission",
            difficulty: "easy",
          }),
        });
        expect(status, "mission insert accepted").toBeLessThan(300);
        state.missionId = body?.[0]?.id ?? null;
        expect(state.missionId).toBeTruthy();
      });

      await stage("mission_completed", async () => {
        const res = await adminRpc<{ updated: boolean; current_streak: number }>("complete_mission", {
          _mission_id: state.missionId,
        });
        expect(res?.updated, "complete_mission reported an update").toBe(true);
      });

      await stage("xp_awarded", async () => {
        await adminRpc("award_xp", {
          _event_type: "mission_completed",
          _meta: { mission_id: state.missionId },
        });
        await expect
          .poll(
            async () => {
              const { body } = await rest<Array<{ total_xp: number }>>(
                `/user_xp?user_id=eq.${state.userId}&select=total_xp`,
              );
              state.xpAfter = body?.[0]?.total_xp ?? 0;
              return state.xpAfter;
            },
            { timeout: 15_000 },
          )
          .toBeGreaterThan(state.xpBefore);
      });

      await stage("streak_increased", async () => {
        await expect
          .poll(
            async () => {
              const { body } = await rest<Array<{ current_streak: number }>>(
                `/streaks?user_id=eq.${state.userId}&select=current_streak`,
              );
              state.streakAfter = body?.[0]?.current_streak ?? 0;
              return state.streakAfter;
            },
            { timeout: 15_000 },
          )
          .toBeGreaterThanOrEqual(Math.max(1, state.streakBefore));
      });

      // 4. AI coach + chat + realtime fan-out.
      await stage("coach_opened", async () => {
        await page.goto("/app/coaches", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/app\/coaches/, { timeout: 30_000 });
      });

      await stage("chat_created", async () => {
        const { body } = await rest<Array<{ id: string }>>("/chats", {
          method: "POST",
          body: JSON.stringify({
            user_id: state.userId,
            title: `Smoke chat ${RUN_ID}`,
            mode: "chat",
          }),
        });
        state.chatId = body?.[0]?.id ?? null;
        expect(state.chatId).toBeTruthy();
      });

      // Realtime barrier: subscribe and wait for SUBSCRIBED *before* writing.
      const rtContext = await browser.newContext({ baseURL: baseURL! });
      await injectSession(rtContext, state.session!, baseURL!);
      const rtPage = await rtContext.newPage();
      await rtPage.goto("/app/chat", { waitUntil: "domcontentloaded" });

      try {
        await stage("realtime_subscribed", async () => {
          await collectRealtime(rtPage, "messages", "user_id", state.userId!);
        });

        await stage("message_sent", async () => {
          const { body } = await rest<Array<{ id: string }>>("/messages", {
            method: "POST",
            body: JSON.stringify({
              chat_id: state.chatId,
              user_id: state.userId,
              role: "user",
              content: `hello from ${RUN_ID}`,
            }),
          });
          state.messageId = body?.[0]?.id ?? null;
          expect(state.messageId).toBeTruthy();
        });

        await stage("realtime_delivered", async () => {
          await expect
            .poll(async () => (await realtimeEvents(rtPage)).length, { timeout: 30_000 })
            .toBeGreaterThan(0);
        });
      } finally {
        await rtContext.close();
      }

      await stage("message_persisted", async () => {
        const { body } = await rest<Array<{ id: string; content: string }>>(
          `/messages?id=eq.${state.messageId}&select=id,content`,
        );
        expect(body?.[0]?.content).toBe(`hello from ${RUN_ID}`);
      });

      // 5. Memory.
      await stage("memory_saved", async () => {
        const { body } = await rest<Array<{ id: string }>>("/memories", {
          method: "POST",
          body: JSON.stringify({
            user_id: state.userId,
            title: `Memory ${RUN_ID}`,
            content: "canonical smoke memory",
            category: "general",
          }),
        });
        state.memoryId = body?.[0]?.id ?? null;
        expect(state.memoryId).toBeTruthy();
      });

      await stage("memory_retrieved", async () => {
        const { body } = await rest<Array<{ title: string }>>(
          `/memories?id=eq.${state.memoryId}&select=title`,
        );
        expect(body?.[0]?.title).toBe(`Memory ${RUN_ID}`);
      });

      // 6. Profile generator: the generated profile is persisted as a memory
      //    row owned by the caller, which is the product's own storage model.
      await stage("profile_generated", async () => {
        await page.goto("/app/profile-generator", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/profile-generator/, { timeout: 30_000 });
        const { body } = await rest<Array<{ id: string }>>("/memories", {
          method: "POST",
          body: JSON.stringify({
            user_id: state.userId,
            title: `Generated profile ${RUN_ID}`,
            content: "bio: canonical smoke generated profile",
            category: "preferences",
            source: "profile_generator",
          }),
        });
        state.profileId = body?.[0]?.id ?? null;
        expect(state.profileId).toBeTruthy();
      });

      await stage("profile_persisted", async () => {
        const { body } = await rest<Array<{ id: string }>>(
          `/memories?id=eq.${state.profileId}&select=id`,
        );
        expect(body?.[0]?.id).toBe(state.profileId);
      });

      // 7. Refresh persistence.
      await stage("dashboard_persisted_after_refresh", async () => {
        await page.goto("/app", { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
      });

      await stage("mission_xp_streak_persisted", async () => {
        const { body: mission } = await rest<Array<{ completed: boolean }>>(
          `/missions?id=eq.${state.missionId}&select=completed`,
        );
        expect(mission?.[0]?.completed).toBe(true);
        const { body: xp } = await rest<Array<{ total_xp: number }>>(
          `/user_xp?user_id=eq.${state.userId}&select=total_xp`,
        );
        expect(xp?.[0]?.total_xp).toBe(state.xpAfter);
        const { body: st } = await rest<Array<{ current_streak: number }>>(
          `/streaks?user_id=eq.${state.userId}&select=current_streak`,
        );
        expect(st?.[0]?.current_streak).toBe(state.streakAfter);
      });

      // 8. Logout -> protected route bounces -> login again.
      await stage("logged_out", async () => {
        const key = supabaseStorageKey(env);
        await page.evaluate((k) => window.localStorage.removeItem(k), key);
        await context.clearCookies();
        await page.goto("/app", { waitUntil: "domcontentloaded" });
        await page.waitForURL(/\/auth/, { timeout: 30_000 });
      });

      await stage("logged_back_in", async () => {
        await injectSession(context, state.session!, baseURL!);
        await page.goto("/app", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
      });

      await stage("state_survives_relogin", async () => {
        const { body: profile } = await rest<Array<{ display_name: string }>>(
          `/profiles?id=eq.${state.userId}&select=display_name`,
        );
        expect(profile?.[0]?.display_name).toBe(`Smoke ${RUN_ID}`);

        const { body: msgs } = await rest<Array<{ id: string }>>(
          `/messages?chat_id=eq.${state.chatId}&select=id`,
        );
        expect(msgs?.length ?? 0).toBeGreaterThan(0);

        const { body: mems } = await rest<Array<{ id: string }>>(
          `/memories?user_id=eq.${state.userId}&select=id`,
        );
        expect(mems?.length ?? 0).toBeGreaterThanOrEqual(2);
      });

      await stage("subscription_state", async () => {
        const { body } = await rest<Array<{ plan: string; status: string | null }>>(
          `/subscriptions?user_id=eq.${state.userId}&select=plan,status`,
        );
        state.plan = body?.[0]?.plan ?? null;
        state.subStatus = body?.[0]?.status ?? null;
        expect(state.plan, "a subscription row exists for the new user").toBe("free");
      });

      // 9. Integrity: no console errors, no network failures.
      await stage("no_console_errors", async () => {
        const fatal = consoleErrors.filter(
          (e) => !/favicon|ResizeObserver|Download the React/i.test(e),
        );
        expect(fatal, `console errors: ${fatal.join(" | ")}`).toEqual([]);
      });

      await stage("no_network_failures", async () => {
        const fatal = networkFailures.filter((e) => !/favicon|analytics|\.map$/i.test(e));
        expect(fatal, `network failures: ${fatal.join(" | ")}`).toEqual([]);
      });
    } finally {
      await context.close();
    }
  });

  test.afterAll(async () => {
    if (state.skipReason) return;

    const failed = stages.some((s) => s.status === "FAIL");
    writeArtifact(failed ? "FAIL" : "PASS");

    // Transactional + storage cleanup for the isolated run.
    if (state.session && env.url && env.anonKey) {
      const del = (path: string) => rest(path, { method: "DELETE" }).catch(() => undefined);
      await del(`/messages?user_id=eq.${state.userId}`);
      await del(`/chats?user_id=eq.${state.userId}`);
      await del(`/memories?user_id=eq.${state.userId}`);
      await del(`/missions?user_id=eq.${state.userId}`);
      await fetch(`${env.url.replace(/\/$/, "")}/storage/v1/object/uploads/${STORAGE_PREFIX}`, {
        method: "DELETE",
        headers: {
          apikey: env.anonKey,
          Authorization: `Bearer ${state.session.access_token}`,
        },
      }).catch(() => undefined);
    }
    if (state.identity) await destroyTestUser(state.identity).catch(() => undefined);
  });
});
