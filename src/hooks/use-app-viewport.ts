import { useEffect } from "react";

/**
 * Publishes the true visible viewport geometry as CSS custom properties on
 * <html> so the app chrome (and above all the chat composer) is always inside
 * the visible area on mobile browsers:
 *
 *   --app-height      real visible height (URL-bar collapse + keyboard aware)
 *   --keyboard-inset  height the software keyboard currently occupies
 *   --vv-offset-top   visualViewport.offsetTop (iOS pans the layout viewport)
 *
 * `100dvh` handles the collapsing URL bar but NOT the software keyboard on
 * iOS Safari, Samsung Internet or Firefox Android; only `visualViewport`
 * reports that. Layouts wired to `var(--app-height, 100dvh)` therefore keep
 * the composer on screen while typing, through orientation changes, browser
 * UI collapse/expand and PWA standalone mode.
 *
 * Client-only; SSR keeps the `100dvh` fallback so hydration never mismatches.
 */
export function useAppViewport() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    let frame = 0;

    const write = () => {
      frame = 0;
      const layout = window.innerHeight || 0;
      const visible = vv?.height ?? layout;
      const offsetTop = vv?.offsetTop ?? 0;
      // Keyboard (or any browser overlay) height, floored at 0 and ignoring
      // the sub-pixel jitter Chrome Android emits while the URL bar animates.
      const raw = layout - visible - offsetTop;
      const keyboard = raw > 24 ? Math.round(raw) : 0;

      root.style.setProperty("--app-height", `${Math.round(visible)}px`);
      root.style.setProperty("--keyboard-inset", `${keyboard}px`);
      root.style.setProperty("--vv-offset-top", `${Math.round(offsetTop)}px`);
      root.dataset.keyboard = keyboard > 0 ? "open" : "closed";
    };

    // rAF-batched: resize/scroll fire in bursts while the keyboard animates.
    const apply = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    // A second pass after the first paint stabilizes the value on browsers
    // that report a stale height during hydration (Samsung Internet, Edge).
    const settle = window.setTimeout(write, 120);

    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    window.addEventListener("focusin", apply);
    window.addEventListener("focusout", apply);
    window.addEventListener("pageshow", apply);

    // Browser UI collapse/expand does not always emit a viewport event on
    // Firefox Android — observe the document box as a backstop.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(apply);
      ro.observe(document.documentElement);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      ro?.disconnect();
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("focusin", apply);
      window.removeEventListener("focusout", apply);
      window.removeEventListener("pageshow", apply);
    };
  }, []);
}
