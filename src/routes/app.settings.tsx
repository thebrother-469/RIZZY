import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  User,
  Brain,
  LogOut,
  Loader2,
  Trash2,
  Download,
  Upload,
  Bell,
  Palette,
  Shield,
  Info,
  Database,
  Lock,
  RotateCcw,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { clearAllMemories, exportMemories, importMemories, memoryStats } from "@/lib/memory";
import { getUserXP } from "@/lib/xp";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerPortalUrl } from "@/lib/billing.functions";
import { UsagePanel } from "@/components/UsagePanel";
import { Sparkles } from "lucide-react";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Account Settings — RizzGod AI" },
      {
        name: "description",
        content:
          "Manage your RizzGod AI account: profile, subscription, notifications, memory, and privacy controls.",
      },
      { property: "og:title", content: "Account Settings — RizzGod AI" },
      {
        property: "og:description",
        content: "Manage your RizzGod AI account, subscription, memory, and privacy.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: SettingsPage,
});

type Profile = {
  display_name: string | null;
  gender: string | null;
  goals: string | null;
  strengths: string | null;
  weaknesses: string | null;
  coaching_style: string | null;
  confidence_level: number | null;
  onboarded_at: string | null;
};

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "usage", label: "Usage", icon: Sparkles },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "memory", label: "AI Memory", icon: Brain },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "security", label: "Security", icon: Lock },
  { id: "data", label: "Data & Storage", icon: Database },
  { id: "about", label: "About", icon: Info },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ACCENTS: { key: string; label: string; primary: string; gold: string }[] = [
  {
    key: "blood",
    label: "Blood & Gold",
    primary: "oklch(0.55 0.22 25)",
    gold: "oklch(0.82 0.16 85)",
  },
  { key: "ember", label: "Ember", primary: "oklch(0.60 0.20 40)", gold: "oklch(0.80 0.14 70)" },
  {
    key: "violet",
    label: "Violet Reign",
    primary: "oklch(0.55 0.22 310)",
    gold: "oklch(0.82 0.15 95)",
  },
  {
    key: "ocean",
    label: "Deep Ocean",
    primary: "oklch(0.55 0.18 235)",
    gold: "oklch(0.78 0.14 190)",
  },
];

function applyAccent(key: string) {
  const a = ACCENTS.find((x) => x.key === key) ?? ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--primary", a.primary);
  root.style.setProperty("--gold", a.gold);
  root.style.setProperty("--ring", a.primary);
  root.style.setProperty(
    "--gradient-blood",
    `linear-gradient(135deg, ${a.primary}, oklch(0.32 0.18 20))`,
  );
  root.style.setProperty(
    "--gradient-gold",
    `linear-gradient(135deg, ${a.gold}, oklch(0.65 0.14 65))`,
  );
  localStorage.setItem("rg_accent", key);
}

function applyMotion(reduced: boolean) {
  document.documentElement.style.setProperty("--rg-motion", reduced ? "0" : "1");
  document.documentElement.classList.toggle("motion-reduce", reduced);
  localStorage.setItem("rg_reduced_motion", reduced ? "1" : "0");
}

function SettingsPage() {
  const { user, plan, signOut } = useAuth();
  const nav = useNavigate();
  const openPortal = useServerFn(getCustomerPortalUrl);
  const [portalLoading, setPortalLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("profile");

  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    gender: "",
    goals: "",
    strengths: "",
    weaknesses: "",
    coaching_style: "",
    confidence_level: 5,
    onboarded_at: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Preferences live in localStorage. They are read AFTER mount (never in a
  // state initializer) so the first client render matches the server pass
  // byte for byte — a `typeof window` guard in an initializer still produces
  // a hydration mismatch.
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [accent, setAccent] = useState<string>("blood");
  const [reduced, setReduced] = useState<boolean>(false);
  const [notifEmail, setNotifEmail] = useState<boolean>(true);
  const [notifPush, setNotifPush] = useState<boolean>(false);
  const [reminderTime, setReminderTime] = useState<string>("09:00");

  useEffect(() => {
    setMemoryEnabled(localStorage.getItem("rg_memory_disabled") !== "1");
    setAccent(localStorage.getItem("rg_accent") ?? "blood");
    setReduced(localStorage.getItem("rg_reduced_motion") === "1");
    setNotifEmail(localStorage.getItem("rg_notif_email") !== "0");
    setNotifPush(localStorage.getItem("rg_notif_push") === "1");
    setReminderTime(localStorage.getItem("rg_reminder") ?? "09:00");
  }, []);
  const [stats, setStats] = useState<{
    chats: number;
    messages: number;
    missions: number;
    memories: number;
    pinned: number;
    xp: number;
    level: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, gender, goals, strengths, weaknesses, coaching_style, confidence_level, onboarded_at",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("chats").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("missions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("completed", true),
      memoryStats(),
      getUserXP(),
    ]).then(([{ data }, cq, mq, misq, mem, xp]) => {
      if (data) setProfile(data as Profile);
      setStats({
        chats: cq.count ?? 0,
        messages: mq.count ?? 0,
        missions: misq.count ?? 0,
        memories: mem.total,
        pinned: mem.pinned,
        xp: xp?.total_xp ?? 0,
        level: xp?.level ?? 1,
      });
      setLoading(false);
    });
  }, [user?.id]);

  useEffect(() => {
    applyAccent(accent);
  }, []);
  useEffect(() => {
    applyMotion(reduced);
  }, []);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profile.display_name,
        gender: profile.gender ? profile.gender : null,
        goals: profile.goals,
        strengths: profile.strengths,
        weaknesses: profile.weaknesses,
        coaching_style: profile.coaching_style,
        confidence_level: profile.confidence_level,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error("Save failed.");
    else toast.success("Saved.");
  };

  const toggleMemory = (on: boolean) => {
    setMemoryEnabled(on);
    localStorage.setItem("rg_memory_disabled", on ? "0" : "1");
    if (user) supabase.from("profiles").update({ memory_enabled: on }).eq("id", user.id);
  };

  const exportAll = async () => {
    if (!user) return;
    const [{ data: p }, { data: chats }, { data: msgs }, { data: missions }, mem] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("chats").select("*").eq("user_id", user.id),
        supabase.from("messages").select("*").eq("user_id", user.id),
        supabase.from("missions").select("*").eq("user_id", user.id),
        exportMemories(),
      ]);
    const dump = {
      version: 2,
      profile: p,
      chats,
      messages: msgs,
      missions,
      memories: mem.memories,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rizzgod-export-${user.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported.");
  };

  const importFile = async (f: File) => {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const payload = parsed.memories ? parsed : { memories: parsed };
      const n = await importMemories(payload);
      toast.success(`Imported ${n} memories.`);
    } catch (e: unknown) {
      toast.error("Import failed: " + errorMessage(e, "invalid file"));
    }
  };

  const deleteChats = async () => {
    if (!user || !confirm("Delete ALL chat history? This cannot be undone.")) return;
    const { error } = await supabase.from("chats").delete().eq("user_id", user.id);
    if (error) toast.error("Failed.");
    else toast.success("Chats deleted.");
  };

  const deleteMemories = async () => {
    if (!confirm("Wipe ALL AI memories? This cannot be undone.")) return;
    try {
      await clearAllMemories();
      toast.success("Memories wiped.");
    } catch {
      toast.error("Failed.");
    }
  };

  const deleteUploads = async () => {
    if (!user || !confirm("Delete ALL your uploaded files? This cannot be undone.")) return;
    const { data: list } = await supabase.storage.from("uploads").list(user.id, { limit: 1000 });
    if (!list?.length) return toast.success("Nothing to delete.");
    const paths = list.map((f) => `${user.id}/${f.name}`);
    const { error } = await supabase.storage.from("uploads").remove(paths);
    if (error) toast.error("Failed.");
    else toast.success(`Deleted ${paths.length} files.`);
  };

  const resetOnboarding = async () => {
    if (!user || !confirm("Reset onboarding? You'll go through it again next time.")) return;
    const { error } = await supabase
      .from("profiles")
      .update({ onboarded_at: null })
      .eq("id", user.id);
    if (error) return toast.error("Failed.");
    toast.success("Onboarding reset.");
    nav({ to: "/app/onboarding" });
  };

  const changePassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  };

  const signOutAll = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error(error.message);
    else {
      toast.success("Signed out of all sessions.");
      nav({ to: "/" });
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    if (!confirm("PERMANENTLY delete your account and ALL data? Type nothing to cancel.")) return;
    if (!confirm("Final warning. This cannot be undone.")) return;
    try {
      const { data: list } = await supabase.storage.from("uploads").list(user.id, { limit: 1000 });
      if (list?.length)
        await supabase.storage.from("uploads").remove(list.map((f) => `${user.id}/${f.name}`));
      // Cascade-delete via profiles FK to auth.users would need edge fn; we clear data & sign out.
      await Promise.all([
        supabase.from("chats").delete().eq("user_id", user.id),
        supabase.from("messages").delete().eq("user_id", user.id),
        supabase.from("missions").delete().eq("user_id", user.id),
        clearAllMemories(),
      ]);
      await supabase
        .from("profiles")
        .update({
          display_name: null,
          gender: null,
          goals: null,
          strengths: null,
          weaknesses: null,
          onboarded_at: null,
          memory_enabled: true,
        })
        .eq("id", user.id);
      await supabase.auth.signOut();
      toast.success("Account data wiped. Contact support to fully remove auth record.");
      nav({ to: "/" });
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed."));
    }
  };

  const orderedTabs = useMemo(() => TABS, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="text-xs text-gold uppercase tracking-widest font-bold mb-1">Settings</div>
        <h1 className="display text-3xl md:text-4xl">
          Your <span className="text-gradient-blood">command center</span>
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Tabs */}
        <nav className="lg:sticky lg:top-4 h-fit flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {orderedTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                  active
                    ? "bg-gradient-blood text-primary-foreground shadow-blood"
                    : t.id === "danger"
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-6 min-w-0">
          {tab === "profile" && (
            <Card title="Profile" icon={<User size={14} />}>
              <Field label="Display name">
                <input
                  value={profile.display_name ?? ""}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  className="input"
                  placeholder="Your name"
                />
              </Field>
              <Field label="How should we address you?">
                <select
                  value={profile.gender ?? ""}
                  onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                  className="input"
                  aria-label="How should we address you"
                >
                  <option value="">— Neutral (default) —</option>
                  <option value="male">King (he/him)</option>
                  <option value="female">Queen (she/her)</option>
                  <option value="nonbinary">Neutral (they/them)</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>
              <Field label="Confidence self-rating (1-10)">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={profile.confidence_level ?? 5}
                  onChange={(e) =>
                    setProfile({ ...profile, confidence_level: Number(e.target.value) })
                  }
                  className="input"
                />
              </Field>
              <Field label="Coaching style">
                <select
                  value={profile.coaching_style ?? ""}
                  onChange={(e) => setProfile({ ...profile, coaching_style: e.target.value })}
                  className="input"
                >
                  <option value="">— None —</option>
                  <option value="brutal">Brutal honesty</option>
                  <option value="hype">Hype coach</option>
                  <option value="strategic">Strategic</option>
                  <option value="mentor">Mentor</option>
                </select>
              </Field>
              <div className="text-xs text-muted-foreground">
                Signed in as {user?.email} •{" "}
                <span className="text-gold uppercase font-bold">{plan}</span>
              </div>
              <SaveBtn onClick={save} saving={saving} />
            </Card>
          )}

          {tab === "usage" && (
            <div className="space-y-4">
              <UsagePanel />
              <p className="text-xs text-white/50 leading-relaxed">
                Quotas reset daily at 00:00 UTC. Enforcement happens server-side using an atomic
                Postgres counter, so parallel requests cannot exceed your plan limit.
              </p>
            </div>
          )}
          {tab === "appearance" && (
            <Card title="Appearance" icon={<Palette size={14} />}>
              <Field label="Accent theme">
                <div className="grid grid-cols-2 gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.key}
                      onClick={() => {
                        setAccent(a.key);
                        applyAccent(a.key);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition ${accent === a.key ? "border-gold bg-gold/10" : "border-border/60 hover:border-gold/40"}`}
                    >
                      <div className="flex -space-x-2">
                        <span
                          className="h-6 w-6 rounded-full border-2 border-background"
                          style={{ background: a.primary }}
                        />
                        <span
                          className="h-6 w-6 rounded-full border-2 border-background"
                          style={{ background: a.gold }}
                        />
                      </div>
                      <span className="font-semibold text-sm">{a.label}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <ToggleRow
                label="Reduced motion"
                desc="Disable animations & transitions."
                on={reduced}
                onChange={(v) => {
                  setReduced(v);
                  applyMotion(v);
                }}
              />
              <div className="text-xs text-muted-foreground">
                RizzGod uses a dark theme by design — bright screens kill vibes.
              </div>
            </Card>
          )}

          {tab === "notifications" && (
            <Card title="Notifications" icon={<Bell size={14} />}>
              <ToggleRow
                label="Email reminders"
                desc="Daily mission & streak nudges."
                on={notifEmail}
                onChange={(v) => {
                  setNotifEmail(v);
                  localStorage.setItem("rg_notif_email", v ? "1" : "0");
                }}
              />
              <ToggleRow
                label="Push notifications"
                desc="Browser push (requires permission)."
                on={notifPush}
                onChange={async (v) => {
                  if (v && "Notification" in window) {
                    const r = await Notification.requestPermission();
                    if (r !== "granted") return toast.error("Permission denied.");
                  }
                  setNotifPush(v);
                  localStorage.setItem("rg_notif_push", v ? "1" : "0");
                }}
              />
              <Field label="Daily reminder time">
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => {
                    setReminderTime(e.target.value);
                    localStorage.setItem("rg_reminder", e.target.value);
                  }}
                  className="input"
                />
              </Field>
            </Card>
          )}

          {tab === "memory" && (
            <Card title="AI Memory" icon={<Brain size={14} />}>
              <ToggleRow
                label="Use memory in coaching"
                desc="Coaches recall your goals, wins, losses."
                on={memoryEnabled}
                onChange={toggleMemory}
              />
              <Field label="Goals">
                <textarea
                  value={profile.goals ?? ""}
                  onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
                  rows={3}
                  className="input resize-none"
                />
              </Field>
              <Field label="Strengths">
                <textarea
                  value={profile.strengths ?? ""}
                  onChange={(e) => setProfile({ ...profile, strengths: e.target.value })}
                  rows={2}
                  className="input resize-none"
                />
              </Field>
              <Field label="Weaknesses to fix">
                <textarea
                  value={profile.weaknesses ?? ""}
                  onChange={(e) => setProfile({ ...profile, weaknesses: e.target.value })}
                  rows={2}
                  className="input resize-none"
                />
              </Field>
              <SaveBtn onClick={save} saving={saving} />
              <a href="/app/memory" className="text-xs text-gold hover:underline">
                → Open full Memory Manager
              </a>
            </Card>
          )}

          {tab === "privacy" && (
            <Card title="Privacy" icon={<Shield size={14} />}>
              <InfoRow label="Data ownership" value="You own 100% of your data. Export anytime." />
              <InfoRow
                label="AI training"
                value="Your conversations are never used to train external models."
              />
              <InfoRow
                label="Sharing"
                value="Nothing is shared with third parties without your consent."
              />
              <InfoRow
                label="Storage location"
                value="Encrypted at rest via Lovable Cloud infrastructure."
              />
            </Card>
          )}

          {tab === "security" && (
            <Card title="Security" icon={<Lock size={14} />}>
              <InfoRow label="Email" value={user?.email ?? "—"} />
              <InfoRow label="Verified" value={user?.email_confirmed_at ? "Yes" : "No"} />
              <InfoRow
                label="Last sign-in"
                value={
                  user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—"
                }
              />
              <div className="flex flex-col gap-2 pt-2">
                <button onClick={changePassword} className="btn-secondary">
                  <KeyRound size={14} /> Send password reset email
                </button>
                <button onClick={signOutAll} className="btn-secondary">
                  <LogOut size={14} /> Sign out of all devices
                </button>
              </div>
            </Card>
          )}

          {tab === "data" && (
            <Card title="Data & Storage" icon={<Database size={14} />}>
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <MiniStat label="Chats" value={stats.chats} />
                  <MiniStat label="Messages" value={stats.messages} />
                  <MiniStat label="Missions" value={stats.missions} />
                  <MiniStat label="Memories" value={stats.memories} />
                  <MiniStat label="Pinned" value={stats.pinned} />
                  <MiniStat label="Total XP" value={stats.xp} />
                </div>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <button onClick={exportAll} className="btn-secondary">
                  <Download size={14} /> Export all data (JSON)
                </button>
                <label className="btn-secondary cursor-pointer">
                  <Upload size={14} /> Import memories (JSON)
                  <input
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
                  />
                </label>
              </div>
            </Card>
          )}

          {tab === "about" && (
            <Card title="About" icon={<Info size={14} />}>
              <InfoRow label="App" value="RizzGod AI" />
              <InfoRow label="Version" value="1.0.0" />
              <InfoRow label="Build" value={new Date().toISOString().slice(0, 10)} />
              <InfoRow label="AI engine" value="CHICO, DRUGZ & JETSKI AI Gateway" />
              <InfoRow
                label="Status"
                value={<span className="text-success font-bold">All systems operational</span>}
              />
              <InfoRow
                label="Plan"
                value={<span className="uppercase font-bold text-gold">{plan}</span>}
              />
              <div className="flex flex-wrap gap-3 pt-1">
                <a href="/pricing" className="text-xs text-gold hover:underline">
                  → {plan === "free" ? "Upgrade plan" : "Change plan"}
                </a>
                {plan !== "free" && (
                  <button
                    disabled={portalLoading}
                    onClick={async () => {
                      setPortalLoading(true);
                      try {
                        const { url } = await openPortal();
                        window.location.href = url;
                      } catch (e: unknown) {
                        toast.error(errorMessage(e, "Could not open billing portal"));
                      } finally {
                        setPortalLoading(false);
                      }
                    }}
                    className="text-xs text-gold hover:underline disabled:opacity-50"
                  >
                    {portalLoading ? "Opening…" : "→ Manage subscription"}
                  </button>
                )}
              </div>
            </Card>
          )}

          {tab === "danger" && (
            <Card title="Danger Zone" icon={<AlertTriangle size={14} />} danger>
              <DangerRow
                label="Reset onboarding"
                desc="Restart the intro flow to re-tune your profile."
                cta={
                  <button onClick={resetOnboarding} className="btn-danger">
                    <RotateCcw size={14} /> Reset
                  </button>
                }
              />
              <DangerRow
                label="Delete all chats"
                desc="Wipes every conversation. Memories stay."
                cta={
                  <button onClick={deleteChats} className="btn-danger">
                    <Trash2 size={14} /> Delete chats
                  </button>
                }
              />
              <DangerRow
                label="Delete all uploads"
                desc="Removes every image & file from storage."
                cta={
                  <button onClick={deleteUploads} className="btn-danger">
                    <Trash2 size={14} /> Delete uploads
                  </button>
                }
              />
              <DangerRow
                label="Wipe all AI memory"
                desc="Coaches forget everything about you."
                cta={
                  <button onClick={deleteMemories} className="btn-danger">
                    <Trash2 size={14} /> Wipe memory
                  </button>
                }
              />
              <DangerRow
                label="Delete account"
                desc="Permanently wipe your data. Contact support to remove auth record."
                cta={
                  <button onClick={deleteAccount} className="btn-danger">
                    <Trash2 size={14} /> Delete account
                  </button>
                }
              />
              <button
                onClick={async () => {
                  await signOut();
                  nav({ to: "/" });
                }}
                className="w-full flex items-center justify-center gap-2 border border-border/60 hover:border-destructive/60 hover:text-destructive py-2.5 rounded-lg text-sm font-semibold transition mt-4"
              >
                <LogOut size={14} /> Sign out
              </button>
            </Card>
          )}
        </div>
      </div>

      <style>{`
        .input { width: 100%; background: color-mix(in oklab, var(--secondary) 50%, transparent); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .input:focus { outline: none; border-color: color-mix(in oklab, var(--gold) 50%, transparent); }
        .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; background: var(--secondary); padding: 0.625rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; transition: background 0.15s; }
        .btn-secondary:hover { background: color-mix(in oklab, var(--secondary) 80%, transparent); }
        .btn-danger { display: inline-flex; align-items: center; gap: 0.375rem; background: color-mix(in oklab, var(--destructive) 15%, transparent); color: var(--destructive); border: 1px solid color-mix(in oklab, var(--destructive) 40%, transparent); padding: 0.5rem 0.875rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .btn-danger:hover { background: color-mix(in oklab, var(--destructive) 25%, transparent); }
      `}</style>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  danger,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`bg-card border rounded-2xl p-6 space-y-4 ${danger ? "border-destructive/40" : "border-border/60"}`}
    >
      <div
        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${danger ? "text-destructive" : "text-gold"}`}
      >
        {icon} {title}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-border/60 p-3 cursor-pointer hover:border-gold/40 transition">
      <div className="flex-1">
        <div className="font-bold text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary mt-1"
      />
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function DangerRow({ label, desc, cta }: { label: string; desc: string; cta: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <div className="shrink-0">{cta}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-secondary/40 border border-border/60 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gold">{label}</div>
      <div className="display text-xl">{value}</div>
    </div>
  );
}

function SaveBtn({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="bg-gradient-blood text-primary-foreground font-bold px-5 py-2.5 rounded-lg shadow-blood text-sm disabled:opacity-60 inline-flex items-center gap-2"
    >
      {saving && <Loader2 size={14} className="animate-spin" />}{" "}
      {saving ? "Saving..." : "Save changes"}
    </button>
  );
}
