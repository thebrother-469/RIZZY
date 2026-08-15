import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth-callback")({
  head: () => ({
    meta: [
      { title: "Finishing sign in — RizzGod AI" },
      {
        name: "description",
        content: "Completing your secure Google sign in and returning you to RizzGod AI.",
      },
      { property: "og:title", content: "Finishing sign in — RizzGod AI" },
      {
        property: "og:description",
        content: "Completing your secure Google sign in for RizzGod AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

/**
 * OAuth landing page. Runs inside the Google sign-in popup (or, when popups are
 * blocked, in the main tab). The Supabase client persists the session to
 * localStorage on this origin, then we notify the opener and close.
 */
function AuthCallback() {
  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      // Give supabase-js a chance to exchange the code/hash for a session.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const opener = window.opener as Window | null;
      if (opener && opener !== window) {
        try {
          opener.postMessage(
            { type: "rizzgod:oauth", ok: Boolean(data.session) },
            window.location.origin,
          );
        } catch {
          /* opener gone */
        }
        window.close();
        return;
      }

      // No opener (popup blocked / direct navigation): continue in this tab.
      window.location.replace(data.session ? "/app" : "/auth");
    };

    const timer = window.setTimeout(finish, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">Completing sign in…</p>
    </main>
  );
}