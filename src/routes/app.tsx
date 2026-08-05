import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your RizzGod AI Workspace" },
      {
        name: "description",
        content:
          "Your signed-in RizzGod AI workspace — coaching chats, roasts, roleplay, missions, and memory in one place.",
      },
      { property: "og:title", content: "Your RizzGod AI Workspace" },
      {
        property: "og:description",
        content: "Signed-in RizzGod AI workspace: coaches, roasts, roleplay, and daily missions.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: AppLayout,
});

/**
 * Auth gate runs *after* hydration rather than in `beforeLoad`.
 *
 * `/app` is `ssr: false`, so the server streams an empty boundary. Throwing a
 * redirect from `beforeLoad` swapped the whole matched route tree while React
 * was still hydrating that boundary, which produced a hydration mismatch on
 * every unauthenticated deep-link into `/app/*`. Navigating from an effect
 * keeps the first client render identical to the server output.
 */
function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !user) {
        setAllowed(false);
        void navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
        return;
      }

      if (pathname !== "/app/onboarding") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded_at")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (profile && !profile.onboarded_at) {
          setAllowed(false);
          void navigate({ to: "/app/onboarding", replace: true });
          return;
        }
      }

      setAllowed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, pathname]);

  if (!allowed) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-hero"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading your workspace…</span>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <AuthProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthProvider>
  );
}
