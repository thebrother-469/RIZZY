# Branch protection — RIZZGOD AI

Protected branches: `main` and `production`.

## Required settings

| Setting | main | production |
| --- | --- | --- |
| Require a pull request before merging | ✅ | ✅ |
| Required approving reviews | 1 | 2 |
| Dismiss stale approvals on new commits | ✅ | ✅ |
| Require review from Code Owners | ✅ | ✅ |
| Require status checks to pass | ✅ | ✅ |
| Require branches to be up to date | ✅ | ✅ |
| Require conversation resolution | ✅ | ✅ |
| Require linear history | ✅ | ✅ |
| Allow force pushes | ❌ | ❌ |
| Allow deletions | ❌ | ❌ |
| Enforce for admins | ✅ | ✅ |

## Required status checks

All are produced by `.github/workflows/production-gate.yml`:

- `Build verification (TypeScript / ESLint / production build)`
- `SSR + hydration verification`
- `Security verification (RLS / GraphQL / storage / webhooks)`
- `Integration verification (authenticated Playwright + canonical smoke)`
- `Merge gate`

The merge gate itself fails when any upstream stage fails, when the
`SUPA_pg_graphql_authenticated_table_exposed` finding changes shape, or when
the standardized `security-artifacts/` layout is incomplete.

## Automation

```bash
GITHUB_TOKEN=ghp_... GITHUB_REPOSITORY=owner/repo ./scripts/configure-branch-protection.sh
```

The token needs `repo` (classic) or `Administration: write` (fine-grained).
Run it again after renaming a workflow job — check names are matched literally.