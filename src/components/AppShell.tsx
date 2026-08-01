import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  Flame,
  MessageSquareText,
  Image as ImageIcon,
  Theater,
  Target,
  Crown,
  LogOut,
  Menu,
  X,
  Users,
  Settings,
  Brain,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppViewport } from "@/hooks/use-app-viewport";

const NAV = [
  { to: "/app", label: "Dashboard", icon: Flame },
  { to: "/app/coaches", label: "Coaches", icon: Users },
  { to: "/app/chat", label: "Practice", icon: MessageSquareText },
  { to: "/app/roast", label: "Roast My DMs", icon: ImageIcon },
  { to: "/app/profile-generator", label: "Profile Generator", icon: Sparkles },
  { to: "/app/roleplay", label: "Roleplay", icon: Theater },
  { to: "/app/missions", label: "Missions", icon: Target },
  { to: "/app/memory", label: "Memory", icon: Brain },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/pricing", label: "Upgrade", icon: Crown },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, plan, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  // Keep --app-height in sync with the real visible viewport (keyboard-aware).
  useAppViewport();

  // Close mobile menu on route change. Adjusting state during render (React's
  // documented "derive state from props" escape hatch) avoids the extra commit
  // an effect would cause.
  const [lastPath, setLastPath] = useState(loc.pathname);
  if (lastPath !== loc.pathname) {
    setLastPath(loc.pathname);
    if (open) setOpen(false);
  }

  // Lock body scroll while mobile menu open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="bg-hero text-foreground flex flex-col lg:flex-row lg:min-h-dvh h-[var(--app-height,100dvh)] lg:h-auto overflow-hidden lg:overflow-visible">
      {/* Top bar mobile — regular flex child (not sticky) so it doesn't stack
          on top of an h-dvh chat and push the composer offscreen. */}
      <header className="lg:hidden z-40 flex items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur px-4 py-3 pt-safe shrink-0">
        <Link to="/app" className="flex items-center gap-2" aria-label="RizzGod home">
          <span className="display text-2xl text-gradient-blood">RIZZGOD</span>
          <span className="text-[10px] text-gold font-bold tracking-widest">AI</span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="text-foreground h-11 w-11 -mr-2 flex items-center justify-center rounded-lg hover:bg-secondary/60 transition"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Mobile backdrop */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-20 bg-background/60 backdrop-blur-sm animate-in fade-in"
          aria-label="Close menu"
          tabIndex={-1}
        />
      )}

      <aside
        className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 transition-transform duration-200 ease-out fixed lg:sticky top-0 h-[var(--app-height,100dvh)] lg:h-dvh z-30 lg:w-64 w-72 bg-background/95 lg:bg-card/40 backdrop-blur border-r border-border/60 flex flex-col pt-safe pb-safe pl-safe`}
        aria-label="Primary navigation"
      >
        <div className="hidden lg:flex items-center gap-2 px-6 py-6">
          <span className="display text-3xl text-gradient-blood">RIZZGOD</span>
          <span className="text-[10px] text-gold font-bold tracking-widest mt-2">AI</span>
        </div>
        <nav className="px-3 py-4 lg:py-2 flex-1 space-y-1 overflow-y-auto scrollbar-thin">
          {NAV.map((item) => {
            const Active =
              loc.pathname === item.to || (item.to !== "/app" && loc.pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                aria-current={Active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition press ${Active ? "bg-gradient-blood text-primary-foreground shadow-blood" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
              >
                <Icon size={18} />
                {item.label}
                {item.to === "/pricing" && plan === "free" && (
                  <span className="ml-auto text-[10px] font-bold text-gold">PRO</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border/60">
          <div className="flex items-center gap-3 mb-3 min-w-0">
            <div
              className="h-9 w-9 shrink-0 rounded-full bg-gradient-gold flex items-center justify-center text-gold-foreground font-bold"
              aria-hidden="true"
            >
              {(user?.email?.[0] || "K").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{user?.email}</div>
              <div className="text-[11px] text-gold uppercase tracking-wider font-bold">
                {plan} plan
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut();
              nav({ to: "/" });
            }}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2 rounded-lg hover:bg-secondary/60 px-2 transition"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile: constrained flex child so children can use h-full without
          overflowing the viewport. Desktop: natural page scroll. */}
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto lg:overflow-visible lg:min-h-dvh">
        {children}
      </main>
    </div>
  );
}
