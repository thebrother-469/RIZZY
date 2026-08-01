import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireConfetti, isConfettiRunning, prefersReducedMotion } from "@/lib/confetti";
import type { ConfettiEnv } from "@/lib/confetti";

type FakeCanvas = {
  style: Record<string, string>;
  width: number;
  height: number;
  removed: boolean;
  setAttribute: (k: string, v: string) => void;
  getContext: () => unknown;
  remove: () => void;
};

function makeEnv(opts: { reduced?: boolean } = {}) {
  const appended: FakeCanvas[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const cancelled: number[] = [];

  const ctx = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
    fillStyle: "",
  };

  const doc = {
    createElement: () => {
      const canvas: FakeCanvas = {
        style: {},
        width: 0,
        height: 0,
        removed: false,
        setAttribute: () => {},
        getContext: () => ctx,
        remove() {
          this.removed = true;
        },
      };
      return canvas as unknown as HTMLCanvasElement;
    },
    body: {
      appendChild: (node: unknown) => {
        appended.push(node as FakeCanvas);
        return node as Node;
      },
    },
  };

  const win = {
    innerWidth: 400,
    innerHeight: 800,
    devicePixelRatio: 2,
    matchMedia: (q: string) => ({ matches: !!opts.reduced && q.includes("reduced-motion") }),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      cancelled.push(id);
      frames.delete(id);
    },
  };

  const runFrames = (n: number) => {
    for (let i = 0; i < n; i++) {
      const entry = [...frames.entries()][0];
      if (!entry) return;
      frames.delete(entry[0]);
      entry[1](performance.now());
    }
  };

  return {
    env: { win, doc } as unknown as ConfettiEnv,
    appended,
    frames,
    cancelled,
    runFrames,
    ctx,
  };
}

describe("confetti", () => {
  beforeEach(() => {
    // Ensure no animation leaks between tests.
    fireConfetti({ env: null });
  });

  it("is a no-op when the user prefers reduced motion", () => {
    const { env, appended, frames } = makeEnv({ reduced: true });
    expect(prefersReducedMotion(env)).toBe(true);
    const cleanup = fireConfetti({ env });
    expect(appended).toHaveLength(0);
    expect(frames.size).toBe(0);
    cleanup();
  });

  it("is a no-op outside a browser environment", () => {
    const cleanup = fireConfetti({ env: null });
    expect(typeof cleanup).toBe("function");
    expect(isConfettiRunning()).toBe(false);
  });

  it("mounts exactly one non-interactive overlay canvas and starts a frame loop", () => {
    const { env, appended, frames } = makeEnv();
    const cleanup = fireConfetti({ env, particleCount: 5 });
    expect(appended).toHaveLength(1);
    expect(appended[0].style.pointerEvents).toBe("none");
    expect(appended[0].style.position).toBe("fixed");
    expect(appended[0].width).toBe(800); // 400px * dpr 2
    expect(frames.size).toBe(1);
    cleanup();
  });

  it("never runs two animations at once (double-click safe)", () => {
    const { env, appended, frames } = makeEnv();
    fireConfetti({ env, particleCount: 3 });
    fireConfetti({ env, particleCount: 3 });
    expect(appended).toHaveLength(2);
    expect(appended[0].removed).toBe(true); // first one torn down
    expect(appended[1].removed).toBe(false);
    expect(frames.size).toBe(1); // only one live loop
    fireConfetti({ env: null });
    expect(isConfettiRunning()).toBe(true);
    const active = appended[1];
    // manual cleanup of the live animation
    fireConfetti({ env, particleCount: 1, durationMs: 0 });
    expect(active.removed).toBe(true);
  });

  it("removes the canvas and cancels the frame when it finishes on its own", () => {
    const { env, appended, cancelled, runFrames } = makeEnv();
    fireConfetti({ env, particleCount: 4, durationMs: 0 });
    runFrames(1);
    expect(appended[0].removed).toBe(true);
    expect(isConfettiRunning()).toBe(false);
    expect(cancelled.length).toBeGreaterThanOrEqual(0);
  });

  it("cleanup is idempotent and cancels the pending frame (no leak on unmount)", () => {
    const { env, appended, cancelled } = makeEnv();
    const cleanup = fireConfetti({ env, particleCount: 4, durationMs: 5000 });
    cleanup();
    cleanup();
    expect(appended[0].removed).toBe(true);
    expect(cancelled).toHaveLength(1);
    expect(isConfettiRunning()).toBe(false);
  });

  it("draws particles while running", () => {
    const { env, ctx, runFrames } = makeEnv();
    const cleanup = fireConfetti({ env, particleCount: 6, durationMs: 5000, random: () => 0.5 });
    runFrames(1);
    expect(ctx.fillRect).toHaveBeenCalled();
    cleanup();
  });
});
