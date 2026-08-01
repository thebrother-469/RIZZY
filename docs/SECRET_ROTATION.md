# Secret Rotation Runbook

Operator-only. Never paste secret values into this repo, chat, screenshots, or
logs. Every value below is stored in the Lovable/Supabase secrets manager and
injected as `process.env.*` at runtime.

## Rotation order (execute top-to-bottom)

1. `LEMONSQUEEZY_WEBHOOK_SECRET`
2. `LEMONSQUEEZY_API_KEY`
3. `LEMONSQUEEZY_STORE_ID` / `LEMONSQUEEZY_PRO_VARIANT_ID` / `LEMONSQUEEZY_ELITE_VARIANT_ID` (only when a store/product is replaced)
4. `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` (paired)
5. `SUPABASE_SERVICE_ROLE_KEY` (last — highest blast radius)

Rotate one secret at a time. After each step, hit `/api/public/health` with
the `x-health-secret` monitor header and confirm `env.status === "ok"` and no
entries in `env.missing` before moving on.

---

## 1. `LEMONSQUEEZY_WEBHOOK_SECRET`

Purpose: HMAC signing secret verified in `src/routes/api/public/lemon-webhook.ts`.
Compromise = attacker can forge `subscription_*` events and grant free Pro/Elite.

Steps:

1. Lemon Squeezy dashboard → Settings → Webhooks → select the RizzGod webhook.
2. Generate a new signing secret; copy once.
3. In Lovable → Settings → Secrets, `update_secret` on `LEMONSQUEEZY_WEBHOOK_SECRET`
   with the new value. Save.
4. Save the webhook in Lemon Squeezy (this activates the new secret on their side).
5. Trigger a Lemon "Send test event" for `subscription_created`. In Supabase,
   verify a new row appears in `public.lemonsqueezy_webhook_events`; if
   the row is absent or the response was 401, the two sides do not match — repeat step 3.

Rollback: paste the previous secret back into `update_secret` AND paste the
same value into Lemon Squeezy's webhook config (both sides must match).

Verification checklist:

- [ ] Test event returns 200 from `/api/public/lemon-webhook`.
- [ ] `lemonsqueezy_webhook_events` row inserted with `event_id` matching the test.
- [ ] Replaying the same payload does NOT insert a second row (idempotency).

---

## 2. `LEMONSQUEEZY_API_KEY`

Purpose: bearer for the Lemon Squeezy REST API (checkouts, subscription reads).
Compromise = attacker can create checkouts and read customer data.

Steps:

1. Lemon Squeezy → Settings → API. Create a new key; copy once. Do not revoke
   the old one yet.
2. `update_secret` on `LEMONSQUEEZY_API_KEY` in Lovable. Save.
3. Wait for the next deploy to pick up the new value (server functions read
   `process.env` at handler call time).
4. Exercise a checkout flow (Pro plan `/pricing` → checkout) end-to-end.
5. Revoke the old key in Lemon Squeezy.

Rollback: paste the old key back via `update_secret` before revoking it.

Verification checklist:

- [ ] `/api/public/lemon-checkout` returns a valid Lemon checkout URL.
- [ ] Manual test purchase creates the expected `subscriptions` row.

---

## 3. Variant / Store IDs

Purpose: `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`,
`LEMONSQUEEZY_ELITE_VARIANT_ID` map plan tiers to Lemon product variants.

Rotate only when replacing the store or a product. Update all three in one
session — a mismatched pair silently maps upgrades to the wrong plan.

Verification checklist:

- [ ] `/pricing` → Pro checkout URL contains the new pro variant id.
- [ ] `/pricing` → Elite checkout URL contains the new elite variant id.
- [ ] After a test purchase, `subscriptions.plan` is the tier you clicked.

---

## 4. Supabase publishable keys

Purpose: browser-side anon key. Rotate the server (`SUPABASE_PUBLISHABLE_KEY`)
and client (`VITE_SUPABASE_PUBLISHABLE_KEY`) values in the SAME operation —
they must be the same value or SSR reads and browser reads disagree.

Steps:

1. Supabase dashboard → Settings → API → regenerate the anon/publishable key.
2. `update_secret` on `SUPABASE_PUBLISHABLE_KEY` AND
   `VITE_SUPABASE_PUBLISHABLE_KEY` in the same submission.
3. Redeploy (the `VITE_*` value is inlined at build time).
4. Hit the site in an incognito window; unauthenticated pages must load and
   `/api/public/health` `env.status` must be `ok`.

Rollback: only possible before the old key is revoked; Supabase invalidates
the old anon key on regeneration.

---

## 5. `SUPABASE_SERVICE_ROLE_KEY`

Purpose: full RLS bypass — read/write every user's data. Highest severity.
Rotate this LAST so the app is otherwise healthy first.

Steps:

1. Supabase dashboard → Settings → API → regenerate the service role key.
2. `update_secret` on `SUPABASE_SERVICE_ROLE_KEY`. Save.
3. Trigger a webhook or admin-scoped server function (e.g. Lemon test event)
   to exercise the admin client.
4. Confirm the resulting insert appears in Supabase (`lemonsqueezy_webhook_events`).
5. If unhealthy: paste the previous value back immediately via `update_secret`,
   then investigate. Regenerating again produces a new value and the old one
   cannot be recovered.

Verification checklist:

- [ ] `/api/public/health` (with monitor header) reports `env.status: ok`.
- [ ] `/api/public/lemon-webhook` test event succeeds.
- [ ] `supabase.auth.admin.*` server functions (if any) still succeed.

---

## Post-rotation audit

After any Lemon or Supabase rotation, audit for signs of prior abuse:

```sql
-- Recent webhook activity (Lemon)
select event_id, created_at
from public.lemonsqueezy_webhook_events
order by created_at desc
limit 50;

-- Recent plan changes
select user_id, plan, updated_at
from public.subscriptions
order by updated_at desc
limit 50;
```

Flag any plan promotions that don't correspond to a matching
`lemonsqueezy_webhook_events` row.

---

## Guardrails

- Never commit real values to `.env`. The tracked `.env` contains only
  publishable values and `__set_in_secrets_manager__` placeholders.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It must not appear
  in any `VITE_*` variable, `import.meta.env`, loader data, or component props.
- `/api/public/*` handlers must verify caller identity (webhook signature,
  cron auth) before doing any privileged write.
