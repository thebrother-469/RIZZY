# RIZZGOD AI — Security Evidence Report

Generated: 2026-09-03T11:39:47.857Z
Database snapshot captured: 2026-08-03T22:36:36.931Z (live-query)
Supabase project: `jfiojbbrdfgeruborkzx`

This document is the audit artifact for the finding
`SUPA_pg_graphql_authenticated_table_exposed`. Every table reachable through
pg_graphql is listed with the exact SQL that protects it.

## Summary

- GraphQL-exposed tables (authenticated role): **11**
- Service-only tables (no client grant): **6**
- Tables with RLS enabled: **17/17**
- Tables granting anything to `anon`: **0**
- Policy violations detected: **0**

| Table | Exposure | RLS | anon | authenticated | auth.uid() | row scope |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | authenticated | ✅ | — | INSERT,SELECT,UPDATE | ✅ | PASS |
| `chats` | authenticated | ✅ | — | DELETE,INSERT,SELECT,UPDATE | ✅ | PASS |
| `messages` | authenticated | ✅ | — | DELETE,INSERT,SELECT,UPDATE | ✅ | PASS |
| `memories` | authenticated | ✅ | — | DELETE,INSERT,SELECT,UPDATE | ✅ | PASS |
| `missions` | authenticated | ✅ | — | DELETE,INSERT,SELECT,UPDATE | ✅ | PASS |
| `subscriptions` | authenticated | ✅ | — | SELECT | ✅ | PASS |
| `user_xp` | authenticated | ✅ | — | SELECT | ✅ | PASS |
| `streaks` | authenticated | ✅ | — | SELECT | ✅ | PASS |
| `badges` | authenticated | ✅ | — | SELECT | ✅ | PASS |
| `usage_daily` | authenticated | ✅ | — | SELECT | ✅ | PASS |
| `xp_events` | authenticated | ✅ | — | SELECT | ✅ | PASS |
| `auth_audit_logs` | service_only | ✅ | — | — | ✅ | PASS |
| `profile_gen_usage` | service_only | ✅ | — | — | ✅ | PASS |
| `onboarding_debug_events` | service_only | ✅ | — | — | ✅ | PASS |
| `daily_mission_debug_events` | service_only | ✅ | — | — | ✅ | PASS |
| `lemonsqueezy_webhook_events` | service_only | ✅ | — | — | ✅ | PASS |
| `paddle_webhook_events` | service_only | ✅ | — | — | ✅ | PASS |

## Exposed tables

### `public.profiles`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | INSERT,SELECT,UPDATE, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT INSERT, SELECT, UPDATE ON public.profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profiles TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own profile select"
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "own profile insert"
  ON public.profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT auth.uid() AS uid) = id);
```

**UPDATE policy SQL**

```sql
CREATE POLICY "own profile update"
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = id)
  WITH CHECK (( SELECT auth.uid() AS uid) = id);
```

**DELETE policy SQL**

```sql
-- no DELETE policy: RLS denies DELETE for every client role
```

### `public.chats`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | DELETE,INSERT,SELECT,UPDATE, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, SELECT, UPDATE ON public.chats TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.chats TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own chats all"
  ON public.chats
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "own chats all"
  ON public.chats
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**UPDATE policy SQL**

```sql
CREATE POLICY "own chats all"
  ON public.chats
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**DELETE policy SQL**

```sql
CREATE POLICY "own chats all"
  ON public.chats
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

### `public.messages`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | DELETE,INSERT,SELECT,UPDATE, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, SELECT, UPDATE ON public.messages TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.messages TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own msg all"
  ON public.messages
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "own msg all"
  ON public.messages
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**UPDATE policy SQL**

```sql
CREATE POLICY "own msg all"
  ON public.messages
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**DELETE policy SQL**

```sql
CREATE POLICY "own msg all"
  ON public.messages
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

### `public.memories`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | DELETE,INSERT,SELECT,UPDATE, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, SELECT, UPDATE ON public.memories TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.memories TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own memories"
  ON public.memories
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "own memories"
  ON public.memories
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**UPDATE policy SQL**

```sql
CREATE POLICY "own memories"
  ON public.memories
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

**DELETE policy SQL**

```sql
CREATE POLICY "own memories"
  ON public.memories
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
```

### `public.missions`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | DELETE,INSERT,SELECT,UPDATE, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, SELECT, UPDATE ON public.missions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.missions TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own missions read"
  ON public.missions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "Users can create their own missions"
  ON public.missions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id) AND (completed = false) AND (completed_at IS NULL));
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Users can update own mission reflection and skip"
  ON public.missions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id) AND (completed = ( SELECT m.completed FROM missions m WHERE (m.id = missions.id))) AND (NOT (completed_at IS DISTINCT FROM ( SELECT m.completed_at FROM missions m WHERE (m.id = missions.id)))));
```

**DELETE policy SQL**

```sql
CREATE POLICY "Users can delete their own missions"
  ON public.missions
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

### `public.subscriptions`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `anon`, `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | SELECT, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own sub select"
  ON public.subscriptions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "Block client inserts on subscriptions"
  ON public.subscriptions
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Block client updates on subscriptions"
  ON public.subscriptions
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Block client deletes on subscriptions"
  ON public.subscriptions
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING false;
```

### `public.user_xp`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `anon`, `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | SELECT, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT SELECT ON public.user_xp TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_xp TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own xp read"
  ON public.user_xp
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "Block client inserts on user_xp"
  ON public.user_xp
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Block client updates on user_xp"
  ON public.user_xp
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Block client deletes on user_xp"
  ON public.user_xp
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING false;
```

### `public.streaks`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `anon`, `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | SELECT, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT SELECT ON public.streaks TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.streaks TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own streaks read"
  ON public.streaks
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "Block client inserts on streaks"
  ON public.streaks
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Block client updates on streaks"
  ON public.streaks
  AS PERMISSIVE
  FOR UPDATE
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Block client deletes on streaks"
  ON public.streaks
  AS PERMISSIVE
  FOR DELETE
  TO anon, authenticated
  USING false;
```

### `public.badges`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | SELECT, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT SELECT ON public.badges TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.badges TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own badges read"
  ON public.badges
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid() AS uid));
```

**INSERT policy SQL**

```sql
CREATE POLICY "Badges are not user-writable (insert)"
  ON public.badges
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Badges are not user-writable (update)"
  ON public.badges
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Badges are not user-writable (delete)"
  ON public.badges
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING false;
```

### `public.usage_daily`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `anon`, `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | SELECT, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT SELECT ON public.usage_daily TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_daily TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own usage read"
  ON public.usage_daily
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "Block client inserts on usage_daily"
  ON public.usage_daily
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Block client updates on usage_daily"
  ON public.usage_daily
  AS PERMISSIVE
  FOR UPDATE
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Block client deletes on usage_daily"
  ON public.usage_daily
  AS PERMISSIVE
  FOR DELETE
  TO anon, authenticated
  USING false;
```

### `public.xp_events`

| Property | Value |
| --- | --- |
| pg_graphql exposure | reachable by the **authenticated** role (intentional, owner-scoped) |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | SELECT, filtered by RLS |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT SELECT ON public.xp_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.xp_events TO service_role;
-- no privileges granted to anon
```

**SELECT policy SQL**

```sql
CREATE POLICY "own xp events read"
  ON public.xp_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "Block client inserts on xp_events"
  ON public.xp_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Block client updates on xp_events"
  ON public.xp_events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Block client deletes on xp_events"
  ON public.xp_events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING false;
```

## Service-only tables

### `public.auth_audit_logs`

| Property | Value |
| --- | --- |
| pg_graphql exposure | **not exposed** to any client role |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | none — no GRANT to `authenticated` |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.auth_audit_logs TO service_role;
-- no privileges granted to anon
-- no privileges granted to authenticated
```

**SELECT policy SQL**

```sql
CREATE POLICY "auth_audit_owner_select"
  ON public.auth_audit_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid() AS uid));
```

**INSERT policy SQL**

```sql
-- no INSERT policy: RLS denies INSERT for every client role
```

**UPDATE policy SQL**

```sql
-- no UPDATE policy: RLS denies UPDATE for every client role
```

**DELETE policy SQL**

```sql
-- no DELETE policy: RLS denies DELETE for every client role
```

### `public.profile_gen_usage`

| Property | Value |
| --- | --- |
| pg_graphql exposure | **not exposed** to any client role |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | none — no GRANT to `authenticated` |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profile_gen_usage TO service_role;
-- no privileges granted to anon
-- no privileges granted to authenticated
```

**SELECT policy SQL**

```sql
CREATE POLICY "own profile gen usage read"
  ON public.profile_gen_usage
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id);
```

**INSERT policy SQL**

```sql
CREATE POLICY "block client insert profile gen usage"
  ON public.profile_gen_usage
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "block client update profile gen usage"
  ON public.profile_gen_usage
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "block client delete profile gen usage"
  ON public.profile_gen_usage
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING false;
```

### `public.onboarding_debug_events`

| Property | Value |
| --- | --- |
| pg_graphql exposure | **not exposed** to any client role |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | none — no GRANT to `authenticated` |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.onboarding_debug_events TO service_role;
-- no privileges granted to anon
-- no privileges granted to authenticated
```

**SELECT policy SQL**

```sql
CREATE POLICY "own onboarding debug read"
  ON public.onboarding_debug_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid() AS uid));
```

**INSERT policy SQL**

```sql
CREATE POLICY "block client insert onboarding debug"
  ON public.onboarding_debug_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "block client update onboarding debug"
  ON public.onboarding_debug_events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "block client delete onboarding debug"
  ON public.onboarding_debug_events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING false;
```

### `public.daily_mission_debug_events`

| Property | Value |
| --- | --- |
| pg_graphql exposure | **not exposed** to any client role |
| RLS enabled | ✅ yes |
| Owner column | `user_id` |
| Allowed roles (policies) | `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | none — no GRANT to `authenticated` |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.daily_mission_debug_events TO service_role;
-- no privileges granted to anon
-- no privileges granted to authenticated
```

**SELECT policy SQL**

```sql
CREATE POLICY "own daily mission debug read"
  ON public.daily_mission_debug_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = ( SELECT auth.uid() AS uid));
```

**INSERT policy SQL**

```sql
CREATE POLICY "block client insert daily mission debug"
  ON public.daily_mission_debug_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "block client update daily mission debug"
  ON public.daily_mission_debug_events
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "block client delete daily mission debug"
  ON public.daily_mission_debug_events
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING false;
```

### `public.lemonsqueezy_webhook_events`

| Property | Value |
| --- | --- |
| pg_graphql exposure | **not exposed** to any client role |
| RLS enabled | ✅ yes |
| Owner column | n/a |
| Allowed roles (policies) | `service_role` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | none — no GRANT to `authenticated` |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lemonsqueezy_webhook_events TO service_role;
-- no privileges granted to anon
-- no privileges granted to authenticated
```

**SELECT policy SQL**

```sql
CREATE POLICY "service role only"
  ON public.lemonsqueezy_webhook_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING true
  WITH CHECK true;
```

**INSERT policy SQL**

```sql
CREATE POLICY "service role only"
  ON public.lemonsqueezy_webhook_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING true
  WITH CHECK true;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "service role only"
  ON public.lemonsqueezy_webhook_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING true
  WITH CHECK true;
```

**DELETE policy SQL**

```sql
CREATE POLICY "service role only"
  ON public.lemonsqueezy_webhook_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING true
  WITH CHECK true;
```

### `public.paddle_webhook_events`

| Property | Value |
| --- | --- |
| pg_graphql exposure | **not exposed** to any client role |
| RLS enabled | ✅ yes |
| Owner column | n/a |
| Allowed roles (policies) | `anon`, `authenticated` |
| Anonymous access | ❌ none — no GRANT to `anon` |
| Authenticated access | none — no GRANT to `authenticated` |
| auth.uid() enforcement | ✅ every client policy is scoped to `auth.uid()` (or denies outright) |
| Row-scope verification | ✅ PASS (live two-user probe) |

**GRANT statements**

```sql
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.paddle_webhook_events TO service_role;
-- no privileges granted to anon
-- no privileges granted to authenticated
```

**SELECT policy SQL**

```sql
CREATE POLICY "Deny all client access"
  ON public.paddle_webhook_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**INSERT policy SQL**

```sql
CREATE POLICY "Deny all client access"
  ON public.paddle_webhook_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**UPDATE policy SQL**

```sql
CREATE POLICY "Deny all client access"
  ON public.paddle_webhook_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

**DELETE policy SQL**

```sql
CREATE POLICY "Deny all client access"
  ON public.paddle_webhook_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING false
  WITH CHECK false;
```

## Verification

- `bun run verify:graphql:audit` — live anon/authenticated collection reachability.
- `bun run verify:graphql:row-scope` — live two-user `auth.uid()` row isolation, including nested relations, pagination and ordering.
- `bun run verify:rls` — direct PostgREST CRUD isolation.
- `bun run security:findings` — fails the release gate if the accepted finding changes shape.
