import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.{test,spec}.ts",
      "tests/api/**/*.{test,spec}.ts",
      "tests/security/**/*.{test,spec}.ts",
    ],
    setupFiles: ["tests/unit/ssr/setup.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Scope coverage to the pure modules exercised by the unit suite.
      // Broader coverage requires the Playwright/integration layer.
      include: ["src/lib/lemon.ts", "src/lib/cron-auth.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 88,
      },
    },
  },
});
