import { useEffect, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";
import { installHydrationDiagnostics } from "@/lib/hydration-diagnostics";

const SITE_URL = "https://rizzgod-ai.vercel.app";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 bg-hero">
      <div className="max-w-md text-center">
        <h1 className="display text-7xl text-gradient-blood">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Bro, that page ghosted you.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It's not in the rotation. Slide back home.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-gradient-blood px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-blood"
        >
          Take me home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "application-name", content: "RizzGod AI" },
      { name: "apple-mobile-web-app-title", content: "RizzGod AI" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { name: "theme-color", content: "#1a0808" },
      { name: "color-scheme", content: "dark" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:site_name", content: "RizzGod AI" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "RizzGod AI — Brutally Honest AI Dating Coach" },
      { property: "og:title", content: "RizzGod AI — Brutally Honest AI Dating Coach" },
      { name: "twitter:title", content: "RizzGod AI — Brutally Honest AI Dating Coach" },
      {
        name: "description",
        content:
          "RizzGod AI roasts your DMs, scores your rizz 1–10, runs date roleplays, and hands you the exact reply that gets a yes. Free to start.",
      },
      {
        property: "og:description",
        content:
          "RizzGod AI roasts your DMs, scores your rizz 1–10, runs date roleplays, and hands you the exact reply that gets a yes. Free to start.",
      },
      {
        name: "twitter:description",
        content:
          "RizzGod AI roasts your DMs, scores your rizz 1–10, runs date roleplays, and hands you the exact reply that gets a yes. Free to start.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5c347491-6f68-49dc-9720-6035d5029ffb/id-preview-2262e0d6--81635716-e5dd-4676-947a-7cca5d3886b9.lovable.app-1784059762221.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5c347491-6f68-49dc-9720-6035d5029ffb/id-preview-2262e0d6--81635716-e5dd-4676-947a-7cca5d3886b9.lovable.app-1784059762221.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "RizzGod AI",
          url: SITE_URL,
          logo: `${SITE_URL}/icon-512.png`,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "RizzGod AI",
          url: SITE_URL,
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installHydrationDiagnostics();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors />
    </QueryClientProvider>
  );
}
