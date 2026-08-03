/**
 * Centralized personalization title resolver.
 *
 * The ONLY trusted signal is an explicit, self-selected salutation the user
 * stored on their profile (`profiles.preferred_title`). Legacy self-declared
 * `profiles.gender` is honoured for users who set it before the dedicated
 * field existed. Names, emails, Gmail accounts, usernames and display names
 * are NEVER inspected — they are not gender signals.
 *
 * No explicit preference => neutral copy ("Champion"). Never guess.
 */
export type PreferredTitle = "king" | "queen" | "neutral";

export type TitleProfile = {
  /** Explicit self-selected salutation. */
  preferred_title?: string | null;
  /** Legacy self-declared value, kept for back-compat. */
  gender?: string | null;
  /** Onboarding completion timestamp; absent means the profile is not trusted yet. */
  onboarded_at?: string | null;
} | null;

export type ResolvedTitle = {
  /** "King" / "Queen" when explicitly chosen, otherwise null (neutral). */
  title: "King" | "Queen" | null;
  /** Lowercase form for mid-sentence use, otherwise null. */
  lower: "king" | "queen" | null;
  /** Always-safe salutation: the chosen title or the neutral default. */
  salutation: string;
  /** Lowercase always-safe salutation for mid-sentence use. */
  salutationLower: string;
};

/** Neutral, respectful default used whenever no explicit preference exists. */
export const NEUTRAL_SALUTATION = "Champion";

const NEUTRAL: ResolvedTitle = {
  title: null,
  lower: null,
  salutation: NEUTRAL_SALUTATION,
  salutationLower: NEUTRAL_SALUTATION.toLowerCase(),
};

const KING: ResolvedTitle = {
  title: "King",
  lower: "king",
  salutation: "King",
  salutationLower: "king",
};
const QUEEN: ResolvedTitle = {
  title: "Queen",
  lower: "queen",
  salutation: "Queen",
  salutationLower: "queen",
};

export function resolveTitle(profile: TitleProfile): ResolvedTitle {
  if (!profile) return NEUTRAL;

  // 1. Explicit preference always wins and needs no onboarding gate — the user
  //    literally picked it.
  switch (profile.preferred_title) {
    case "king":
      return KING;
    case "queen":
      return QUEEN;
    case "neutral":
      return NEUTRAL;
  }

  // 2. Legacy self-declared value, trusted only on a completed profile.
  if (!profile.onboarded_at) return NEUTRAL;
  switch (profile.gender) {
    case "male":
      return KING;
    case "female":
      return QUEEN;
    default:
      return NEUTRAL;
  }
}

/** "Welcome back, king" | "Welcome back, queen" | "Welcome back, champion" */
export function greeting(prefix: string, profile: TitleProfile): string {
  return `${prefix}, ${resolveTitle(profile).salutationLower}`;
}

/** "Let's go, king." | "Let's go, champion." */
export function sentence(prefix: string, profile: TitleProfile): string {
  return `${greeting(prefix, profile)}.`;
}

/** Capitalized address form: "King" | "Queen" | "Champion". */
export function salutation(profile: TitleProfile): string {
  return resolveTitle(profile).salutation;
}
