/**
 * Canonical email/notification copy registry.
 *
 * EVERY greeting in this file is produced by the shared personalization
 * helper (`src/lib/title.ts`). No template may embed a salutation literal —
 * `tests/unit/personalization/email-templates.test.ts` scans this directory
 * and fails CI if one appears. That guarantees a stored profile title renders
 * identically in the product UI and in every outbound message.
 */
import { getUserTitle, greeting, type TitleProfile } from "@/lib/title";

export type EmailCategory = "onboarding" | "premium" | "notification";

export interface EmailContext {
  /** The recipient's profile — the ONLY source of the salutation. */
  profile: TitleProfile;
  /** Optional first name used after the salutation ("King John"). */
  firstName?: string | null;
  /** Template-specific interpolation values. */
  data?: Record<string, string | number>;
}

export interface RenderedEmail {
  key: string;
  category: EmailCategory;
  subject: string;
  /** "Hey King John" / "Hey Champion" — always helper-derived. */
  greeting: string;
  heading: string;
  body: string[];
  cta?: { label: string; href: string };
  /** Flat text rendering used by the snapshot tests. */
  text: string;
}

/**
 * The address line. Resolution order is the product-wide contract:
 * explicit stored title -> legacy self-declared value -> neutral default.
 * A first name is appended only as a suffix; it never influences the title.
 */
export function addressee(ctx: EmailContext): string {
  const title = getUserTitle(ctx.profile).salutation;
  const name = (ctx.firstName ?? "").trim();
  return name ? `${title} ${name}` : title;
}

/** Sentence-case greeting for mid-copy use ("welcome back, champion"). */
export function lowerGreeting(prefix: string, ctx: EmailContext): string {
  return greeting(prefix, ctx.profile);
}

type Definition = {
  category: EmailCategory;
  subject: (ctx: EmailContext) => string;
  heading: (ctx: EmailContext) => string;
  body: (ctx: EmailContext) => string[];
  cta?: (ctx: EmailContext) => { label: string; href: string };
};

const v = (ctx: EmailContext, key: string, fallback = "") =>
  String(ctx.data?.[key] ?? fallback);

const DEFINITIONS: Record<string, Definition> = {
  // ------------------------------------------------------------ onboarding
  "onboarding-welcome": {
    category: "onboarding",
    subject: (c) => `Welcome to RIZZGOD AI, ${addressee(c)}`,
    heading: (c) => `Hey ${addressee(c)}`,
    body: (c) => [
      "Your coaching account is live.",
      `Three minutes of setup and your first mission is ready — ${lowerGreeting("let's move", c)}.`,
    ],
    cta: () => ({ label: "Start onboarding", href: "/app/onboarding" }),
  },
  "onboarding-complete": {
    category: "onboarding",
    subject: (c) => `Setup complete, ${addressee(c)}`,
    heading: (c) => `Profile locked in, ${addressee(c)}`,
    body: (c) => [
      "Your coach now knows your goals, strengths and weak spots.",
      `Everything from here is personalized to you, ${lowerGreeting("one rep at a time", c)}.`,
    ],
    cta: () => ({ label: "Open your dashboard", href: "/app" }),
  },
  "onboarding-mission-unlock": {
    category: "onboarding",
    subject: (c) => `Your first mission is unlocked, ${addressee(c)}`,
    heading: (c) => `Mission unlocked, ${addressee(c)}`,
    body: (c) => [
      `Today's mission: ${v(c, "missionTitle", "a small, deliberate rep")}.`,
      "Finish it to earn XP and start your streak.",
    ],
    cta: () => ({ label: "View mission", href: "/app/missions" }),
  },
  "onboarding-streak-intro": {
    category: "onboarding",
    subject: (c) => `How streaks work, ${addressee(c)}`,
    heading: (c) => `Streaks, ${addressee(c)}`,
    body: () => [
      "One completed mission a day keeps the streak alive.",
      "Miss a day and it resets — your longest streak is kept forever.",
    ],
  },
  "onboarding-coach-intro": {
    category: "onboarding",
    subject: (c) => `Meet your coaches, ${addressee(c)}`,
    heading: (c) => `Your coaching bench, ${addressee(c)}`,
    body: () => [
      "Each coach has a different voice, tempo and level of bluntness.",
      "Switch any time — your memory and history follow you.",
    ],
    cta: () => ({ label: "Browse coaches", href: "/app/coaches" }),
  },

  // --------------------------------------------------------------- premium
  "premium-upgrade": {
    category: "premium",
    subject: (c) => `You're upgraded, ${addressee(c)}`,
    heading: (c) => `Welcome to ${v(c, "plan", "Pro")}, ${addressee(c)}`,
    body: (c) => [
      `Your ${v(c, "plan", "Pro")} plan is active.`,
      "Unlimited practice, deeper memory and every coach are unlocked.",
    ],
    cta: () => ({ label: "Open RIZZGOD AI", href: "/app" }),
  },
  "premium-subscription-confirmation": {
    category: "premium",
    subject: (c) => `Subscription confirmed, ${addressee(c)}`,
    heading: (c) => `Confirmed, ${addressee(c)}`,
    body: (c) => [
      `Plan: ${v(c, "plan", "Pro")}.`,
      `Next billing date: ${v(c, "renewsAt", "shown in your billing settings")}.`,
    ],
    cta: () => ({ label: "Manage billing", href: "/app/settings" }),
  },
  "premium-renewal": {
    category: "premium",
    subject: (c) => `Your plan renews soon, ${addressee(c)}`,
    heading: (c) => `Heads up, ${addressee(c)}`,
    body: (c) => [
      `${v(c, "plan", "Pro")} renews on ${v(c, "renewsAt", "your next billing date")}.`,
      "No action needed — cancel any time from settings.",
    ],
    cta: () => ({ label: "Manage billing", href: "/app/settings" }),
  },
  "premium-cancellation": {
    category: "premium",
    subject: (c) => `Your subscription is cancelled, ${addressee(c)}`,
    heading: (c) => `Sorry to see you go, ${addressee(c)}`,
    body: (c) => [
      `You keep full access until ${v(c, "endsAt", "the end of the current period")}.`,
      "Your history, memory and streaks stay exactly where they are.",
    ],
    cta: () => ({ label: "Reactivate", href: "/pricing" }),
  },
  "premium-receipt": {
    category: "premium",
    subject: (c) => `Your receipt, ${addressee(c)}`,
    heading: (c) => `Payment received, ${addressee(c)}`,
    body: (c) => [
      `Amount: ${v(c, "amount", "—")}.`,
      `Invoice: ${v(c, "invoiceId", "—")}.`,
    ],
    cta: () => ({ label: "View invoice", href: "/app/settings" }),
  },
  "premium-trial": {
    category: "premium",
    subject: (c) => `Your trial has started, ${addressee(c)}`,
    heading: (c) => `Trial active, ${addressee(c)}`,
    body: (c) => [
      `You have ${v(c, "days", "7")} days of full access.`,
      `Use them — ${lowerGreeting("push hard", c)}.`,
    ],
    cta: () => ({ label: "Start practising", href: "/app/chat" }),
  },
  "premium-entitlement": {
    category: "premium",
    subject: (c) => `Access updated, ${addressee(c)}`,
    heading: (c) => `Your access changed, ${addressee(c)}`,
    body: (c) => [
      `Your plan is now ${v(c, "plan", "Free")}.`,
      "Entitlements were updated instantly across every device.",
    ],
    cta: () => ({ label: "Review your plan", href: "/pricing" }),
  },

  // ---------------------------------------------------------- notifications
  "notify-mission-reminder": {
    category: "notification",
    subject: (c) => `Today's mission is waiting, ${addressee(c)}`,
    heading: (c) => `Mission pending, ${addressee(c)}`,
    body: (c) => [
      `${v(c, "missionTitle", "Your daily mission")} is still open.`,
      `Ten minutes is enough — ${lowerGreeting("one rep", c)}.`,
    ],
    cta: () => ({ label: "Complete mission", href: "/app/missions" }),
  },
  "notify-streak-reminder": {
    category: "notification",
    subject: (c) => `Keep the streak alive, ${addressee(c)}`,
    heading: (c) => `${v(c, "streak", "0")}-day streak on the line, ${addressee(c)}`,
    body: () => [
      "Your streak resets at midnight UTC.",
      "One completed mission keeps it running.",
    ],
    cta: () => ({ label: "Save the streak", href: "/app/missions" }),
  },
  "notify-achievement": {
    category: "notification",
    subject: (c) => `Badge unlocked, ${addressee(c)}`,
    heading: (c) => `Nice work, ${addressee(c)}`,
    body: (c) => [
      `You unlocked: ${v(c, "badge", "a new badge")}.`,
      `Level ${v(c, "level", "1")} and climbing.`,
    ],
    cta: () => ({ label: "See your progress", href: "/app" }),
  },
  "notify-profile": {
    category: "notification",
    subject: (c) => `Your dating profile is ready, ${addressee(c)}`,
    heading: (c) => `Profile generated, ${addressee(c)}`,
    body: () => [
      "Your rewritten bio and opener pack are ready to copy.",
      "Regenerate any section until it sounds like you.",
    ],
    cta: () => ({ label: "Open the generator", href: "/app/profile-generator" }),
  },
};

export type EmailTemplateKey = keyof typeof DEFINITIONS;

export const EMAIL_TEMPLATE_KEYS = Object.keys(DEFINITIONS) as EmailTemplateKey[];

export function renderEmail(key: EmailTemplateKey, ctx: EmailContext): RenderedEmail {
  const def = DEFINITIONS[key];
  if (!def) throw new Error(`unknown email template: ${key}`);
  const heading = def.heading(ctx);
  const body = def.body(ctx);
  const cta = def.cta?.(ctx);
  return {
    key,
    category: def.category,
    subject: def.subject(ctx),
    greeting: heading,
    heading,
    body,
    ...(cta ? { cta } : {}),
    text: [heading, "", ...body, ...(cta ? ["", `${cta.label}: ${cta.href}`] : [])].join("\n"),
  };
}

export function renderAllEmails(ctx: EmailContext): RenderedEmail[] {
  return EMAIL_TEMPLATE_KEYS.map((k) => renderEmail(k, ctx));
}
