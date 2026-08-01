/**
 * Client-side mapping from a server-fn error to the exact message shown in
 * the toast. Extracted from the route so it can be unit-tested.
 */
export type ProfileGenErrorView = {
  kind: "quota" | "rate_limit" | "generic";
  message: string;
};

export function resolveProfileGenError(rawMessage: unknown): ProfileGenErrorView {
  const raw = typeof rawMessage === "string" ? rawMessage : "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.code === "PROFILE_GENERATION_LIMIT_REACHED") {
      const plan = String(parsed.plan ?? "free");
      const limit = Number(parsed.limit ?? 0);
      return {
        kind: "quota",
        message:
          plan === "free"
            ? `You've hit today's free limit (${limit}). Upgrade to Pro for 30/day.`
            : `You've hit today's Pro limit (${limit}). Upgrade to Elite for unlimited.`,
      };
    }
    if (parsed?.code === "RATE_LIMIT_EXCEEDED") {
      return { kind: "rate_limit", message: "Too many requests, wait 30 seconds" };
    }
  } catch {
    /* not JSON — plain message */
  }
  return { kind: "generic", message: raw || "Couldn't generate. Try again." };
}
