import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-hero text-foreground">
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="display text-2xl md:text-3xl text-gradient-blood">RIZZGOD</span>
            <span className="text-[10px] text-gold font-bold tracking-widest mt-1">AI</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              to="/pricing"
              className="text-muted-foreground hover:text-foreground hidden sm:inline"
            >
              Pricing
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="font-semibold bg-gradient-blood text-primary-foreground px-4 py-2 rounded-lg shadow-blood"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <header className="mb-10">
          <h1 className="display text-4xl md:text-6xl text-gradient-blood">{title}</h1>
          {updated && (
            <p className="mt-3 text-sm text-muted-foreground">Effective date: {updated}</p>
          )}
        </header>
        <article className="prose-legal space-y-6 text-[15px] leading-relaxed text-foreground/90">
          {children}
        </article>
        <footer className="mt-16 pt-8 border-t border-border/40 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-gold">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-gold">
            Privacy
          </Link>
          <Link to="/refund-policy" className="hover:text-gold">
            Refund Policy
          </Link>
          <Link to="/pricing" className="hover:text-gold">
            Pricing
          </Link>
          <span className="ml-auto">© {new Date().getFullYear()} RizzGod AI</span>
        </footer>
      </main>
    </div>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="display text-2xl md:text-3xl text-foreground mt-10 mb-3">{children}</h2>;
}
export function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-bold text-foreground mt-6 mb-2">{children}</h3>;
}
export function P({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}
export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc pl-6 space-y-1 text-muted-foreground marker:text-gold">{children}</ul>
  );
}
