import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => {
    const next =
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : undefined;
    const mode: "signin" | "signup" = (s.mode as string) === "signup" ? "signup" : "signin";
    return next ? { mode, next } : { mode };
  },
  head: () => ({
    meta: [
      { title: "Sign in — RizzGod AI" },
      {
        name: "description",
        content:
          "Sign in or create your RizzGod AI account to start practicing flirting, roasting DMs, and crushing daily missions.",
      },
      { property: "og:title", content: "Sign in — RizzGod AI" },
      {
        property: "og:description",
        content: "Sign in to RizzGod AI — your brutally honest AI dating coach.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/auth" },
      { name: "twitter:title", content: "Sign in — RizzGod AI" },
      {
        name: "twitter:description",
        content: "Sign in to RizzGod AI — your brutally honest AI dating coach.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/auth" }],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().email("Drop a real email, bro."),
  password: z.string().min(6, "Min 6 chars."),
});

function friendlyAuthError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "Wrong email or password. Try again.";
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed"))
    return "Check your inbox — confirm your email before signing in.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "That email's already in. Try signing in instead.";
  if (m.includes("rate") && m.includes("limit"))
    return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password") && m.includes("6")) return "Password needs at least 6 characters.";
  if (m.includes("network") || m.includes("fetch"))
    return "Connection dropped. Check your network and retry.";
  return msg || "Something went wrong.";
}

function AuthPage() {
  const { mode, next } = Route.useSearch();
  const nav = useNavigate();
  const redirectTarget = next ?? "/app";
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const signInWithGoogle = async () => {
    setGoogleLoading(true);

    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth-callback`;

      // Open the popup synchronously (inside the click) so popup blockers allow it.
      const popup = window.open("about:blank", "rizzgod-google-oauth", "width=480,height=640");

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error || !data?.url) {
        popup?.close();
        toast.error(friendlyAuthError(error?.message ?? ""));
        setGoogleLoading(false);
        return;
      }

      if (!popup || popup.closed) {
        // Popup blocked — fall back to a normal redirect in this tab.
        window.location.assign(data.url);
        return;
      }

      popup.location.replace(data.url);

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        window.clearInterval(closedTimer);
      };

      const complete = async () => {
        cleanup();
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          toast.success("You're in. Welcome to the brotherhood.");
          nav({ to: redirectTarget });
        } else {
          setGoogleLoading(false);
        }
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== origin) return;
        const payload = event.data as { type?: string } | null;
        if (payload?.type !== "rizzgod:oauth") return;
        void complete();
      };

      window.addEventListener("message", onMessage);

      // Handles the user closing/cancelling the popup manually.
      const closedTimer = window.setInterval(() => {
        if (popup.closed) void complete();
      }, 500);
    } catch (e: unknown) {
      toast.error(friendlyAuthError(errorMessage(e, "")));
      setGoogleLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${redirectTarget}` },
        });
        if (error) throw error;
        // If email confirmation is required, no session comes back.
        if (!data.session) {
          toast.success("Account created. Check your inbox to confirm your email.");
          setIsSignup(false);
          setPassword("");
          return;
        }
        toast.success("You're in. Welcome to the brotherhood.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      if (next) window.location.href = next;
      else nav({ to: "/app" });
    } catch (e: unknown) {
      toast.error(friendlyAuthError(errorMessage(e, "")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-hero flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center mb-8">
          <span className="display text-4xl text-gradient-blood">RIZZGOD</span>
          <span className="text-[10px] text-gold font-bold tracking-widest ml-1">AI</span>
        </Link>
        <div className="bg-card/80 backdrop-blur border border-border/60 rounded-2xl p-7 shadow-card">
          <h1 className="display text-3xl mb-1">
            {isSignup ? "Sign up for RizzGod AI" : "Sign in to RizzGod AI"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {isSignup ? "30 seconds. Then you're training." : "Let's keep building."}
          </p>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label
                htmlFor="auth-email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Email
              </label>
              <input
                id="auth-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
                className="w-full mt-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </div>
            <div>
              <label
                htmlFor="auth-password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="auth-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  className="w-full bg-input border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-r-lg"
                >
                  {showPassword ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <button
              disabled={loading}
              type="submit"
              className="w-full bg-gradient-blood text-primary-foreground font-bold py-3 rounded-lg shadow-blood disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {isSignup ? "Create my account" : "Sign in"}
            </button>
          </form>
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={googleLoading || loading}
            className="w-full bg-black text-white font-semibold py-3 rounded-lg border border-white/15 flex items-center justify-center gap-3 hover:bg-black/80 hover:border-white/25 disabled:opacity-50 transition"
          >
            {googleLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41 34.4 44 29.6 44 24c0-1.3-.1-2.4-.4-3.5z"
                />
              </svg>
            )}
            Continue with Google
          </button>
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="w-full text-center text-xs text-muted-foreground mt-5 hover:text-gold"
          >
            {isSignup ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          {!isSignup && (
            <button
              type="button"
              onClick={async () => {
                if (!email) return toast.error("Enter your email first.");
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) toast.error(friendlyAuthError(error.message));
                else toast.success("Reset link sent. Check your inbox.");
              }}
              className="w-full text-center text-xs text-muted-foreground mt-2 hover:text-gold"
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
