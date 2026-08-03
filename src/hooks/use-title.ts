import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { resolveTitle, greeting, sentence, type TitleProfile } from "@/lib/title";

/**
 * Single source of truth for personalized titles across every surface.
 * Never duplicate this logic in a page/component.
 */
export function useUserTitle() {
  const { user } = useAuth();
  const { data } = useQuery<TitleProfile>({
    queryKey: ["title-profile", user?.id ?? null],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_title, gender, onboarded_at")
        .eq("id", user!.id)
        .maybeSingle();
      return (data as TitleProfile) ?? null;
    },
  });

  const profile = data ?? null;
  return {
    ...resolveTitle(profile),
    greeting: (prefix: string) => greeting(prefix, profile),
    sentence: (prefix: string) => sentence(prefix, profile),
  };
}
