import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Plan = "free" | "pro" | "elite";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  plan: Plan;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPlan: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);

  const loadPlan = async (uid: string, abortSignal: AbortSignal) => {
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", uid)
        .maybeSingle();
      // Check if this request was aborted before updating state
      if (abortSignal.aborted) return;
      setPlan((data?.plan as Plan) ?? "free");
    } catch (err) {
      // Silently ignore abort errors; log others
      if (err instanceof Error && err.message !== "The user aborted a request") {
        console.error("loadPlan failed:", err);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    let lastUid: string | null = null;
    let abortController: AbortController | null = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      // Ignore noisy token refresh events (fires ~hourly + on tab focus).
      if (event === "TOKEN_REFRESHED") {
        setSession(s);
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      const uid = s?.user?.id ?? null;
      if (uid && uid !== lastUid) {
        lastUid = uid;
        // Cancel any previous pending loadPlan
        abortController?.abort();
        abortController = new AbortController();
        // Defer to avoid deadlocking Supabase auth callback.
        setTimeout(() => {
          if (mounted && abortController && !abortController.signal.aborted) {
            loadPlan(uid, abortController.signal);
          }
        }, 0);
      } else if (!uid) {
        lastUid = null;
        abortController?.abort();
        abortController = null;
        setPlan("free");
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      const uid = s?.user?.id ?? null;
      if (uid && uid !== lastUid) {
        lastUid = uid;
        abortController?.abort();
        abortController = new AbortController();
        loadPlan(uid, abortController.signal);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      abortController?.abort();
      abortController = null;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        plan,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refreshPlan: async () => {
          if (user) {
            const ac = new AbortController();
            await loadPlan(user.id, ac.signal);
          }
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
