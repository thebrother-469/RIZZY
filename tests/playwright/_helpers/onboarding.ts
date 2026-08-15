/**
 * Onboarding fixture for authenticated browser suites.
 *
 * The app gates every /app/* surface behind onboarding completion, so specs
 * that target a post-onboarding screen (practice composer, missions, ...) need
 * the E2E account to already be onboarded. This marks `profiles.onboarded_at`
 * for the E2E user via the service role — a data fixture, never a change to
 * the product's gate.
 *
 * Returns null on success, or a NOT VERIFIED reason when the service role /
 * account is not bound in this environment. Never logs a secret.
 */
import { resolveEnv, passwordSignIn } from "../../../scripts/e2e-env";

export async function ensureOnboarded(): Promise<string | null> {
  const e = resolveEnv();
  if (!e.url || !e.serviceKey) {
    return "NOT VERIFIED: SUPABASE_SERVICE_ROLE_KEY is not bound; cannot prepare the onboarded E2E fixture.";
  }

  const { session } = await passwordSignIn(e);
  const userId = session?.user?.id;
  if (!userId) {
    return "NOT VERIFIED: the E2E user cannot sign in; cannot prepare the onboarded fixture.";
  }

  const base = e.url.replace(/\/$/, "");
  const headers = {
    apikey: e.serviceKey,
    Authorization: `Bearer ${e.serviceKey}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${base}/rest/v1/profiles?id=eq.${userId}&onboarded_at=is.null`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    return `NOT VERIFIED: could not mark the E2E profile as onboarded (HTTP ${res.status}).`;
  }

  const check = await fetch(`${base}/rest/v1/profiles?id=eq.${userId}&select=onboarded_at`, {
    headers,
  });
  const rows = (await check.json().catch(() => [])) as { onboarded_at?: string | null }[];
  if (!rows[0]?.onboarded_at) {
    return "NOT VERIFIED: the E2E profile row is missing or still not onboarded.";
  }
  return null;
}