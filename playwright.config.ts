import { defineConfig, devices } from "@playwright/test";

/**
 * RIZZGOD1 Playwright E2E Configuration
 *
 * Goals:
 * - Full CI evidence collection
 * - No reporter/output directory collisions
 * - Stable local + GitHub Actions execution
 * - Chromium default for local speed
 * - Full browser matrix with E2E_MATRIX=full
 * - Trace/video/screenshots/HAR-ready diagnostics
 * - Correct artifact separation
 */

const isFullMatrix = process.env.E2E_MATRIX === "full";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "tests",

  testMatch: ["**/*.spec.ts"],

  timeout: 60_000,

  expect: {
    timeout: 10_000,
  },

  retries: process.env.CI ? 2 : 0,

  fullyParallel: true,

  workers: process.env.CI ? 2 : undefined,

  /**
   * Artifact separation:
   *
   * test-results/
   * ├── traces
   * ├── screenshots
   * ├── videos
   * ├── junit.xml
   * └── results.json
   *
   * playwright-report/
   * └── HTML report
   *
   * These folders MUST NEVER overlap.
   */
  outputDir: "test-results",

  reporter: [
    ["list"],

    [
      "html",
      {
        outputFolder: "playwright-report",
        open: "never",
      },
    ],

    [
      "junit",
      {
        outputFile: "test-results/junit.xml",
      },
    ],

    [
      "json",
      {
        outputFile: "test-results/results.json",
      },
    ],

    /**
     * Custom RIZZGOD trace correlation reporter.
     *
     * Stores:
     * - x-request-id
     * - x-trace-id
     * - traceparent
     * - GitHub Actions summary diagnostics
     */
    ["./tests/playwright/_reporters/trace-id-reporter.ts"],

    ...(process.env.CI ? [["github"] as [string]] : []),
  ],

  use: {
    baseURL,

    /**
     * Maximum debugging evidence.
     *
     * Always collected:
     * - trace
     * - video
     * - screenshot
     */
    trace: "on",

    video: "on",

    screenshot: "on",

    /**
     * Prevent flaky timing caused by slow rendering
     * differences between browsers.
     */
    launchOptions: {
      slowMo: 0,

      /**
       * Optional opt-in override for environments that provide their own
       * Chromium build (e.g. sandboxes without the Playwright browser
       * dependencies). Unset in CI, where Playwright manages the browser.
       */
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    },

    /**
     * HAR is intentionally not global because
     * parallel workers would overwrite files.
     *
     * Add per-test:
     *
     * await context.newContext({
     *   recordHar: {
     *     path: "test-results/example.har"
     *   }
     * })
     */
  },

  projects: isFullMatrix
    ? [
        {
          name: "chromium",
          use: {
            ...devices["Desktop Chrome"],
          },
        },

        {
          name: "firefox",
          use: {
            ...devices["Desktop Firefox"],
          },
        },

        {
          name: "webkit",
          use: {
            ...devices["Desktop Safari"],
          },
        },
      ]
    : [
        {
          name: "chromium",
          use: {
            ...devices["Desktop Chrome"],
          },
        },
      ],

  /**
   * Always start the application unless an external
   * URL is explicitly provided.
   *
   * CI gets its own clean server.
   * Local development can reuse an existing server.
   */
  webServer:
    process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_BASE_URL
      ? undefined
      : {
          command: "bun run dev --host 0.0.0.0",

          url: "http://127.0.0.1:8080",

          reuseExistingServer: !process.env.CI,

          timeout: 120_000,
        },
});
