import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Security regression: the realtime hook must never subscribe without an
 * owner filter, and must always tear the channel down.
 */
const src = readFileSync(resolve(process.cwd(), "src/hooks/use-realtime.ts"), "utf8");

describe("realtime subscription hardening", () => {
  it("always scopes postgres_changes to the caller's own rows", () => {
    expect(src).toContain("filter: `${ownerColumn}=eq.${userId}`");
  });

  it("skips subscribing when there is no authenticated user id", () => {
    expect(src).toMatch(/if \(!enabled \|\| !userId\) return;/);
  });

  it("removes the channel on cleanup so subscriptions cannot leak", () => {
    expect(src).toContain("supabase.removeChannel(ch)");
  });

  it("subscribes inside an effect, never at module or render scope", () => {
    const channelIdx = src.indexOf("supabase.channel(");
    const effectIdx = src.indexOf("useEffect(() => {\n    if (!enabled || !userId) return;");
    expect(effectIdx).toBeGreaterThan(-1);
    expect(channelIdx).toBeGreaterThan(effectIdx);
  });

  it("does not use the service role or admin client on the client", () => {
    expect(src).not.toMatch(/SERVICE_ROLE|client\.server/);
  });
});
