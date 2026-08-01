/**
 * Dependency-free success confetti.
 *
 * Design constraints (all covered by tests/unit/confetti/confetti.test.ts):
 *  - fires at most one animation at a time (a second call cancels the first,
 *    so a double-click can never stack canvases or rAF loops)
 *  - no-op when the user prefers reduced motion
 *  - no-op in non-browser (SSR) environments
 *  - removes its canvas and cancels its frame on completion AND on manual
 *    cleanup, so unmounting mid-animation leaks nothing
 *  - pointer-events: none + fixed overlay => safe on mobile and desktop
 */

export interface ConfettiEnv {
  win: Pick<
    Window,
    "requestAnimationFrame" | "cancelAnimationFrame" | "matchMedia" | "innerWidth" | "innerHeight"
  > & { devicePixelRatio?: number };
  doc: Pick<Document, "createElement"> & { body: Pick<HTMLElement, "appendChild"> };
}

export interface ConfettiOptions {
  particleCount?: number;
  durationMs?: number;
  env?: ConfettiEnv | null;
  /** Deterministic randomness hook for tests. */
  random?: () => number;
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
};

const COLORS = ["#e11d48", "#f59e0b", "#fbbf24", "#f43f5e", "#fde68a", "#ffffff"];

/** Cleanup for the currently running animation, if any. */
let activeCleanup: (() => void) | null = null;

export function isConfettiRunning(): boolean {
  return activeCleanup !== null;
}

export function prefersReducedMotion(env: ConfettiEnv): boolean {
  try {
    return !!env.win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

function defaultEnv(): ConfettiEnv | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return { win: window, doc: document } as unknown as ConfettiEnv;
}

/**
 * Fires the celebration. Returns a cleanup function that is always safe to
 * call (idempotent, and a no-op once the animation finished on its own).
 */
export function fireConfetti(options: ConfettiOptions = {}): () => void {
  const env = options.env === undefined ? defaultEnv() : options.env;
  const noop = () => {};
  if (!env) return noop;
  if (prefersReducedMotion(env)) return noop;

  // Never run two animations at once.
  activeCleanup?.();

  const rand = options.random ?? Math.random;
  const particleCount = options.particleCount ?? 90;
  const durationMs = options.durationMs ?? 1800;

  const canvas = env.doc.createElement("canvas") as HTMLCanvasElement;
  const width = env.win.innerWidth || 360;
  const height = env.win.innerHeight || 640;
  const dpr = Math.min(env.win.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  if (canvas.style) {
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
  }
  canvas.setAttribute?.("aria-hidden", "true");
  canvas.setAttribute?.("data-testid", "confetti-canvas");
  env.doc.body.appendChild(canvas as unknown as Node);

  const ctx = canvas.getContext?.("2d") as CanvasRenderingContext2D | null;
  ctx?.scale?.(dpr, dpr);

  const particles: Particle[] = Array.from({ length: particleCount }, () => ({
    x: width / 2 + (rand() - 0.5) * width * 0.5,
    y: height * 0.35 + (rand() - 0.5) * 80,
    vx: (rand() - 0.5) * 9,
    vy: rand() * -11 - 3,
    size: 4 + rand() * 6,
    rot: rand() * Math.PI * 2,
    vrot: (rand() - 0.5) * 0.4,
    color: COLORS[Math.floor(rand() * COLORS.length) % COLORS.length],
  }));

  let frame: number | null = null;
  let finished = false;
  const start = Date.now();

  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (frame !== null) env.win.cancelAnimationFrame(frame);
    frame = null;
    (canvas as unknown as { remove?: () => void }).remove?.();
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  const tick = () => {
    if (finished) return;
    const elapsed = Date.now() - start;
    const progress = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 1 - progress * progress;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.38; // gravity
        p.vx *= 0.99;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    if (progress >= 1) {
      cleanup();
      return;
    }
    frame = env.win.requestAnimationFrame(tick);
  };

  frame = env.win.requestAnimationFrame(tick);
  activeCleanup = cleanup;
  return cleanup;
}
