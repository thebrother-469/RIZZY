import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
  beforeLoad: async ({ location }) => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw redirect({ to: "/auth", search: { mode: "signin" } });
    if (location.pathname !== "/app/onboarding") {
      const { data: p } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      if (p && !p.onboarded_at) throw redirect({ to: "/app/onboarding" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AuthProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthProvider>
  );
}
