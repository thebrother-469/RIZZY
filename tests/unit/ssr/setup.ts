// SSR test setup — strip Node's auto-provided browser-ish globals so imported
// modules see the same "no browser" surface a Cloudflare Worker / bare Node
// SSR runtime does. Deliberately removes `navigator` (Node ≥21 exposes it).

const BROWSER_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "history",
  "location",
  "matchMedia",
  "MutationObserver",
  "ResizeObserver",
  "IntersectionObserver",
  "screen",
] as const;

for (const name of BROWSER_GLOBALS) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any)[name];
  } catch {
    // Fall back to redefining as undefined if the property is non-configurable.
    try {
      Object.defineProperty(globalThis, name, {
        value: undefined,
        writable: true,
        configurable: true,
      });
    } catch {
      /* noop */
    }
  }
}
