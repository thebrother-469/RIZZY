/**
 * Entitlements & billing abstraction.
 *
 * This centralizes what each plan can do. It intentionally reuses the existing
 * upload MB limits from `src/lib/attachments.ts` so behavior is unchanged.
 *
 * Provider adapters (Lemon Squeezy / mock). Production billing uses the
 * `/api/public/lemon-checkout` and `/api/public/lemon-webhook` server routes;
 * the abstraction below is kept only for optional non-production flows.
 */
import { PLAN_LIMITS_MB, type PlanTier, type AttachmentKind, getLimitMb } from "./attachments";

export type { PlanTier } from "./attachments";

export type Entitlements = {
  /** Max daily coach messages. Infinity = unlimited. */
  dailyMessages: number;
  /** Max saved AI memories. Infinity = unlimited. */
  memoryCap: number;
  /** Whether roleplay scenarios are unlocked. */
  roleplay: boolean;
  /** Whether photo/DM roast uploads beyond first are allowed. */
  unlimitedRoasts: boolean;
  /** Per-file upload cap in MB, per attachment kind. */
  uploadMb: Record<AttachmentKind, number>;
  /** Priority queue during peak. */
  priorityQueue: boolean;
  /** Which coach personalities are unlocked. */
  coaches: "core" | "all";
};

export const ENTITLEMENTS: Record<PlanTier, Entitlements> = {
  free: {
    dailyMessages: 25,
    memoryCap: 50,
    roleplay: true,
    unlimitedRoasts: false,
    uploadMb: PLAN_LIMITS_MB.free,
    priorityQueue: false,
    coaches: "core",
  },
  pro: {
    dailyMessages: Infinity,
    memoryCap: 1000,
    roleplay: true,
    unlimitedRoasts: true,
    uploadMb: PLAN_LIMITS_MB.pro,
    priorityQueue: true,
    coaches: "all",
  },
  elite: {
    dailyMessages: Infinity,
    memoryCap: Infinity,
    roleplay: true,
    unlimitedRoasts: true,
    uploadMb: PLAN_LIMITS_MB.elite,
    priorityQueue: true,
    coaches: "all",
  },
};

export function entitlementsFor(plan: PlanTier): Entitlements {
  return ENTITLEMENTS[plan] ?? ENTITLEMENTS.free;
}

export function uploadLimitMb(plan: PlanTier, kind: AttachmentKind): number {
  return getLimitMb(kind, plan);
}

/** Human-readable plan label. */
export function planLabel(plan: PlanTier): string {
  return plan === "elite" ? "Elite" : plan === "pro" ? "Pro" : "Free";
}

/* -------------------------------------------------------------------------- */
/*  Provider adapter (Lemon Squeezy in production; mock for local dev)       */
/* -------------------------------------------------------------------------- */

export type BillingProviderId = "lemonsqueezy" | "mock";

export type CheckoutRequest = {
  plan: Exclude<PlanTier, "free">;
  userId: string;
  email: string;
  /** Where to send user post-checkout. */
  returnUrl: string;
};

export type BillingProvider = {
  id: BillingProviderId;
  /** Create a checkout session and return the URL to redirect to. */
  createCheckout: (req: CheckoutRequest) => Promise<{ url: string }>;
  /** Open the customer's billing portal (change plan / cancel / update card). */
  openPortal: (opts: { userId: string; returnUrl: string }) => Promise<{ url: string }>;
};

const mockProvider: BillingProvider = {
  id: "mock",
  async createCheckout({ returnUrl }) {
    return { url: `${returnUrl}?mock_checkout=1` };
  },
  async openPortal({ returnUrl }) {
    return { url: `${returnUrl}?mock_portal=1` };
  },
};

/**
 * Resolve which provider to use. Reads `VITE_BILLING_PROVIDER` at build time;
 * defaults to the mock provider so the app keeps running without billing.
 */
export function getBillingProvider(): BillingProvider {
  const id = (import.meta.env.VITE_BILLING_PROVIDER as BillingProviderId | undefined) ?? "mock";
  if (id === "mock") return mockProvider;
  // Real adapters plug in here — kept as mock until API keys + webhook secrets exist.
  return mockProvider;
}
