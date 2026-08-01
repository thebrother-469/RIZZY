import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta OAuth namespace — wrap with local types until the SDK ships stable types.
type OAuthClient = { name?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
};
type SupabaseAuthOAuth = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
function oauth(): SupabaseAuthOAuth {
  return (supabase.auth as unknown as { oauth: SupabaseAuthOAuth }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } as never });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate } as never);
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <p>Could not load this authorization request: {String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="min-h-dvh bg-hero flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card/80 backdrop-blur border border-border/60 rounded-2xl p-7 shadow-card">
        <h1 className="display text-2xl mb-2">Connect {clientName} to RizzGod</h1>
        <p className="text-sm text-muted-foreground mb-5">
          This lets {clientName} read your RizzGod stats, missions, and coaches as you.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 bg-gradient-blood text-primary-foreground font-bold py-2.5 rounded-lg shadow-blood disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border border-border rounded-lg py-2.5 font-semibold disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
