# Coze Stability Report Implementation Plan

> **For agentic workers:** Execute each task independently and keep the changes scoped to the named files. Run the focused test after each task and one consolidated verification pass before handoff.

**Goal:** Turn the Coze report's three stability findings into independently shippable fixes: repair the production community schema, make actor-market authentication consistent for browser sessions, and make task status recovery visible and reliable.

**Constraints:** Preserve the existing workbench architecture and ordinary auth flows. Do not blanket-apply unrelated Supabase migrations. Do not expose secrets. Do not start the Universe/ecosystem phase until this first batch is stable.

## Task 1 — Community feed production repair

- [x] Verify the production Supabase target and confirm only the community publication schema is missing.
- [x] Apply the existing `20260827050000_kiikis_21_community.sql` migration exactly once to production, then record its migration version as applied.
- [x] Verify the four community tables and the public discovery endpoint.
- [x] Keep comments/moderation migrations separate because they are not required for the feed's first recovery.

Expected output: `/api/v2/community/discover` no longer returns schema error for an authenticated or anonymous discovery request, and the migration history is auditable.

## Task 2 — Actor marketplace auth/routing

- [ ] Add regression tests for bearer-token forwarding from purchased actors and market purchase actions.
- [ ] Make `/actors/purchased` render an auth-aware client state instead of redirecting when SSR cookies are absent.
- [ ] Use the shared auth-retry fetcher for purchased-actor reads and purchase preview/confirm actions.
- [ ] Resolve market buyer status from the request (Bearer or cookie), not cookies only.

Expected output: a valid browser session stored by Supabase local storage can open `/actors/purchased`, load its items, see buyer-specific market state, and complete preview/confirm without a route loop or false 401.

## Task 3 — Task center recovery and visibility

- [ ] Add a focused regression test for the task center's active-task refresh and recoverable error state.
- [ ] Remove duplicated auth headers in task actions and make list/actions use the same auth-retry path.
- [ ] Expose last successful refresh and a recoverable connection state in the task center so queued work never becomes an indefinite silent wait.
- [ ] Preserve server-authoritative task states and existing retry/cancel rules.

Expected output: task center refreshes active work, recovers after transient 401/network failure, and visibly tells the user when the last successful update occurred or a retry is needed.

## Consolidated verification

- [ ] Run the focused community, actor, task-center, and server job tests.
- [ ] Run TypeScript/build checks appropriate to the repository.
- [ ] Run the production endpoint smoke checks after the migration and collect the Coze acceptance checklist.
- [ ] Commit only scoped source, tests, documentation, and the auditable migration-recovery record; push the implementation branch for Coze validation.
