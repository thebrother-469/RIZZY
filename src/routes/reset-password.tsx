import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — RizzGod AI" },
      {
        name: "description",
        content:
          "Set a new password for your RizzGod AI account. Use the recovery link from your email to securely reset access.",
      },
      { property: "og:title", content: "Reset Password — RizzGod AI" },
      { property: "og:description", content: "Securely reset your RizzGod AI account password." },
      { property: "og:url", content: "/reset-password" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "/reset-password" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  useEffect(() => {
    // Supabase places recovery token in the URL hash; the client auto-exchanges it.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const isRecovery = hash.includes("type=recovery");
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // If we already have a session (link already parsed), allow reset.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session || isRecovery) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password needs at least 6 characters.");
    if (pw !== pw2) return toast.error("Passwords don't match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You're in.");
    nav({ to: "/app" });
  };

  return (
    <main className="min-h-dvh bg-hero flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center mb-8">
          <span className="display text-4xl text-gradient-blood">RIZZGOD</span>
          <span className="text-[10px] text-gold font-bold tracking-widest ml-1">AI</span>
        </Link>
        <div className="bg-card/80 backdrop-blur border border-border/60 rounded-2xl p-7 shadow-card">
          <h1 className="display text-3xl mb-1">Reset password</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {ready ? "Pick a new password. Make it strong." : "Verifying reset link…"}
          </p>
          {ready ? (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label
                  htmlFor="reset-password-new"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  New password
                </label>
                <div className="relative mt-1">
                  <input
                    id="reset-password-new"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    type={showPw ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full bg-input border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    aria-pressed={showPw}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-r-lg"
                  >
                    {showPw ? (
                      <EyeOff size={16} aria-hidden="true" />
                    ) : (
                      <Eye size={16} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label
                  htmlFor="reset-password-confirm"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Confirm
                </label>
                <div className="relative mt-1">
                  <input
                    id="reset-password-confirm"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    type={showPw2 ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full bg-input border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw2((v) => !v)}
                    aria-label={showPw2 ? "Hide password" : "Show password"}
                    aria-pressed={showPw2}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-r-lg"
                  >
                    {showPw2 ? (
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
                Update password
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          )}
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className="block text-center text-xs text-muted-foreground mt-5 hover:text-gold"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
