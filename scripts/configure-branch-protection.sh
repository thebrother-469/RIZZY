#!/usr/bin/env bash
# Applies the branch-protection rules documented in .github/branch-protection.md.
#
#   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo ./scripts/configure-branch-protection.sh
#
# Idempotent: re-running simply re-asserts the same configuration.
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required (repo / Administration: write)}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required, e.g. owner/repo}"

API="https://api.github.com/repos/${GITHUB_REPOSITORY}"
CHECKS='[
  {"context":"Build verification (TypeScript / ESLint / production build)"},
  {"context":"SSR + hydration verification"},
  {"context":"Security verification (RLS / GraphQL / storage / webhooks)"},
  {"context":"Integration verification (authenticated Playwright + canonical smoke)"},
  {"context":"Merge gate"}
]'

apply() {
  local branch="$1" reviews="$2"
  echo "==> protecting ${branch} (${reviews} approving review(s))"
  local payload
  payload=$(cat <<JSON
{
  "required_status_checks": { "strict": true, "checks": ${CHECKS} },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": ${reviews},
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
)
  curl -sS -X PUT \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${API}/branches/${branch}/protection" \
    -d "${payload}" \
    -o /tmp/bp-${branch}.json -w "    HTTP %{http_code}\n"
  if ! grep -q '"required_status_checks"' "/tmp/bp-${branch}.json"; then
    echo "    !! failed: $(head -c 300 "/tmp/bp-${branch}.json")"
    return 1
  fi
}

status=0
apply main 1 || status=1
# `production` may not exist in every fork; do not hard-fail the whole run.
if curl -sS -o /dev/null -w '%{http_code}' \
     -H "Authorization: Bearer ${GITHUB_TOKEN}" \
     "${API}/branches/production" | grep -q '^200$'; then
  apply production 2 || status=1
else
  echo "==> skipping production (branch does not exist)"
fi

exit "${status}"