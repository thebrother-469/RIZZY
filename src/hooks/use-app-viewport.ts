import { useEffect } from "react";

/**
 * Publishes the true visible viewport height as `--app-height` on
 * <html>. On mobile Safari / Chrome the URL bar collapse AND the software
 * keyboard both shrink `visualViewport.height` — `100dvh` handles the URL
 * bar but not the keyboard on older iOS. Wiring layouts to
 * `var(--app-height, 100dvh)` keeps the composer visible when typing.
 *
 * Runs on the client only; SSR keeps the `100dvh` fallback.
 */
export function useAppViewport() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;

    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(h)}px`);
    };

    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
}
