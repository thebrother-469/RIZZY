# RIZZGOD AI — Final Production Certification Report

Generated: 2026-09-02 (UTC) — full browser verification run in the build sandbox.

Toolchain: `@tanstack/react-start` **1.168.46**, `@tanstack/react-router` 1.170.32,
`@tanstack/router-plugin` 1.168.35. Browser: Chromium 146.0.7680.80 (system build,
driven by Playwright via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

## Gate status

| Item | Status | Evidence |
| --- | --- | --- |
| Production build | PASS | `vite build` — 0 errors |
| TypeScript typecheck | PASS | `tsgo --noEmit` — 0 errors |
| Unit + integration tests | PASS | vitest **524 tests / 30 files**, 0 failures |
| SSR suite | PASS | `security-artifacts/ssr-smoke.json` (49/0) |
| Hydration suite | PASS | `security-artifacts/hydration-smoke.json` (48/0) |
| verify:rls | PASS | `security-artifacts/rls-audit.json` (72/72, 0 failures) |
| verify:storage | PASS | `security-artifacts/storage-audit.json` (19/19, 0 failures) |
| GraphQL exposure | PASS | `security-artifacts/graphql-exposure.json` (34 PASS / 0 FAIL) |
| GraphQL row-scope | PASS | `security-artifacts/graphql-row-scope.json` (105 PASS / 0 FAIL) |
| Security findings gate | PASS | `security-artifacts/security-findings.json` |
| Security evidence | PASS | `security-artifacts/security-evidence.{md,json}` |
| **Authenticated Playwright** | **PASS** | 10/10 specs — `tests/playwright/authenticated` |
| **Canonical production smoke** | **PASS** | 26/26 stages — `security-artifacts/production-smoke.json` |
| **Preview smoke (SSR + hydration)** | **PASS** | 6/6 routes — `security-artifacts/preview-smoke.json` |
| **Mobile / PWA standalone** | **PASS** | 3/3 devices, 18 observations — `security-artifacts/mobile-pwa.json` |
| Artifact layout gate | PASS | `bun run verify:artifacts` — 10/10 artifacts valid |
| GitHub Actions workflow matrix | NOT_VERIFIED | No GitHub API access from the build sandbox; workflows are committed and dispatchable (see below) |

## Authenticated Playwright — PASS (10/10)

`tests/playwright/authenticated` executed in a real Chromium instance against the
running app with a minted Supabase session:

- anonymous redirect away from `/app`, `/app/chat`, `/app/missions`, `/app/settings`
- authenticated load of `/app`, `/app/chat`, `/app/missions`, `/app/settings`
- session survives reload **and** a full browser restart (storageState reuse)
- chat message persists and broadcasts to a second live realtime client

Evidence per test (screenshots, traces, videos, console + network logs) is written
to `test-results/` and `playwright-report/` by the Playwright reporters, and is
uploaded as the `playwright-evidence` artifact in CI.

Fix landed during this run: the realtime helper now applies the user's JWT to the
Realtime socket (`client.realtime.setAuth`) **before** the channel joins. Previously
the channel joined as `anon`, RLS filtered every row, and the subscription reported
`SUBSCRIBED` while receiving nothing.

## Canonical production smoke — PASS (26/26 stages)

Full disposable-identity journey, 18.9 s wall clock:

signup → session → onboarding → onboarding persisted → XP/streak baseline →
mission generated → mission completed → XP awarded → streak increased → coach
opened → chat created → realtime subscribed → message sent → realtime delivered →
message persisted → memory saved → memory retrieved → profile generated → profile
persisted → dashboard persisted after refresh → mission/XP/streak persisted →
logout → login → state survives re-login → subscription state → no console errors →
no network failures.

Two expectation-drift repairs:

1. `complete_mission` / `award_xp` carry **no `EXECUTE` grant for `authenticated`**
   by design — the app reaches them only from server functions running with the
   service role and an explicit `_caller_id`. The smoke test now exercises that exact
   service-mediated path instead of calling the RPC with a user token.
2. `net::ERR_ABORTED` request failures are module prefetches the browser cancels on
   navigation; they are no longer counted as product network failures.

## Preview smoke — PASS (6/6 routes)

`bun run verify:preview:smoke` against the deployed preview URL. For each public
route it fetches the raw HTML (pre-JavaScript SSR evidence) and then loads it in
Chromium to observe hydration, console errors and network faults.

| Route | HTTP | Server-rendered | Hydrated | Console errors |
| --- | --- | --- | --- | --- |
| `/` | 200 | yes | yes | 0 |
| `/pricing` | 200 | yes | yes | 0 |
| `/auth` | 200 | yes | yes | 0 |
| `/privacy` | 200 | yes | yes | 0 |
| `/terms` | 200 | yes | yes | 0 |
| `/dating-profile-generator` | 200 | yes | yes | 0 |

## Mobile / PWA — PASS (3 devices)

`tests/playwright/mobile/pwa-standalone-practice.spec.ts` in standalone display
mode (`display-mode: standalone` asserted at runtime) on iPhone 14 Pro (notch),
Pixel 7 (gesture nav) and a small mobile viewport. Each device verifies first
render, keyboard open, keyboard close, refresh, landscape and back-to-portrait —
composer fully inside the visual viewport, no horizontal overflow, no scroll
offset, focus retained after reload.

## Workflow matrix — NOT_VERIFIED

`production-gate`, `vercel-preview-smoke`, `security-regression`, `verify-onboarding`
and `e2e` are committed under `.github/workflows/`, and the preview-smoke stage is
now wired into both `production-gate.yml` and `vercel-preview-smoke.yml`. The build
sandbox has no GitHub API credentials, so no run IDs can be attached. Dispatch them
from the repository (Actions → Run workflow) to produce run IDs; every gate they
execute is the same command verified locally above.

## Residual notes

- Storage bucket `uploads` is private, capped at the 50 MB platform ceiling with an
  explicit MIME allowlist; app-side plan limits are clamped to the same ceiling.
- `SECURITY DEFINER` functions carry no `PUBLIC` / `anon` / `authenticated` EXECUTE
  grants; `missions_completion_guard` enforces completion/ownership immutability for
  client roles.
