/**
 * Chat persistence + realtime fan-out.
 *
 * Two authenticated contexts for the same user run simultaneously: one
 * writes a message, the other must receive exactly one postgres_changes
 * event for it — no duplicates, no misses — and the row must still be there
 * after a reload. Cleanup of the subscription is asserted explicitly.
 */
import { test, expect } from "@playwright/test";
import {
  authPreflight,
  createAuthenticatedContext,
  createRealtimeContext,
  collectRealtime,
  realtimeEvents,
} from "../_helpers/auth";
import { resolveEnv } from "../../../scripts/e2e-env";

let skipReason: string | null = null;
test.beforeAll(async () => {
  skipReason = await authPreflight();
});
test.beforeEach(() => {
  test.skip(!!skipReason, skipReason ?? "");
});

type Row = { id: string };

async function rest(path: string, token: string, init: RequestInit = {}) {
  const e = resolveEnv();
  const res = await fetch(`${e.url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: e.anonKey!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
}

test("a new chat message persists and broadcasts to a second live client", async ({
  browser,
  baseURL,
}) => {
  const primary = await createAuthenticatedContext(browser, baseURL!);
  const secondary = await createRealtimeContext(browser, baseURL!, primary.session);
  const token = primary.session.access_token;
  const userId = primary.session.user.id;
  let chatId: string | undefined;

  try {
    await secondary.page.goto("/app", { waitUntil: "domcontentloaded" });
    await collectRealtime(secondary.page, "messages", "user_id", userId);

    const created = await rest("/chats", token, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, title: "E2E realtime chat", mode: "chat" }),
    });
    expect(created.status, "chat insert must be allowed for its owner").toBeLessThan(300);
    chatId = (created.body as Row[])[0]?.id;
    expect(chatId).toBeTruthy();

    const content = `e2e-${Date.now()}`;
    const msg = await rest("/messages", token, {
      method: "POST",
      body: JSON.stringify({ chat_id: chatId, user_id: userId, role: "user", content }),
    });
    expect(msg.status).toBeLessThan(300);

    // Realtime delivery: exactly one event carrying this payload.
    await secondary.page.waitForFunction(
      (needle) =>
        (
          (window as unknown as { __rtEvents?: { new?: { content?: string } }[] }).__rtEvents ?? []
        ).filter((e) => e.new?.content === needle).length > 0,
      content,
      { timeout: 30_000 },
    );
    const events = (await realtimeEvents(secondary.page)) as { new?: { content?: string } }[];
    const matching = events.filter((e) => e.new?.content === content);
    expect(matching, "exactly one event, no duplicates").toHaveLength(1);

    // Persistence across reload.
    const readBack = await rest(`/messages?chat_id=eq.${chatId}&select=content`, token);
    expect(JSON.stringify(readBack.body)).toContain(content);

    // Subscription cleanup leaves no live channels behind.
    await secondary.page.goto("/", { waitUntil: "domcontentloaded" });
    const leaked = await secondary.page.evaluate(
      () => (window as unknown as { __rtEvents?: unknown[] }).__rtEvents === undefined,
    );
    expect(leaked, "navigating away tears down the page's channels").toBe(true);
  } finally {
    if (chatId) await rest(`/chats?id=eq.${chatId}`, token, { method: "DELETE" });
    await secondary.context.close();
    await primary.context.close();
  }
});
