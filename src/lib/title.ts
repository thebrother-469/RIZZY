/**
 * Centralized personalization title resolver.
 *
 * The ONLY trusted signal is the self-declared `profiles.gender` value that the
 * user explicitly stored in their profile. Names, emails, usernames and display
 * names are never inspected — they are not reliable gender signals.
 *
 * Unknown / undeclared / non-binary / withheld => neutral copy. Never guess,
 * never expose confidence values.
 */
export type TrustedGender = "male" | "female" | "nonbinary" | "prefer_not_to_say";

export type TitleProfile = {
  gender?: string | null;
  /** Onboarding completion timestamp; absent means the profile is not trusted yet. */
  onboarded_at?: string | null;
} | null;

export type ResolvedTitle = {
  /** "King" / "Queen" when trusted, otherwise null (neutral). */
  title: "King" | "Queen" | null;
  /** Lowercase form for mid-sentence use, otherwise null. */
  lower: "king" | "queen" | null;
};

const NEUTRAL: ResolvedTitle = { title: null, lower: null };

export function resolveTitle(profile: TitleProfile): ResolvedTitle {
  if (!profile) return NEUTRAL;
  // Trust requires an explicitly completed onboarding record.
  if (!profile.onboarded_at) return NEUTRAL;
  switch (profile.gender) {
    case "male":
      return { title: "King", lower: "king" };
    case "female":
      return { title: "Queen", lower: "queen" };
    default:
      return NEUTRAL;
  }
}

/** "Welcome back, king" | "Welcome back, queen" | "Welcome back" */
export function greeting(prefix: string, profile: TitleProfile): string {
  const { lower } = resolveTitle(profile);
  return lower ? `${prefix}, ${lower}` : prefix;
}

/** "Let's go, king." | "Let's go." */
export function sentence(prefix: string, profile: TitleProfile): string {
  return `${greeting(prefix, profile)}.`;
}
