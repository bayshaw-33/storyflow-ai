# Phase 2 Video Quick Review

> Task: `KIIKIS-P2-CODEX-002` / Phase 2 24-hour storyboard-to-video sprint
> Reviewed baseline: `df201cd652efa0c741acaf5ea66c5204d280d9f2` (2026-07-18)
> Scope: migration gate, Shot video API contract, idempotency, storage, polling, and secret boundary.
> This is a quick review, not an implementation approval.

## BLOCKER

1. **The required staging migration rehearsal cannot run safely yet.** Local Docker is unavailable; the Supabase CLI is not authenticated; and `supabase/.temp/linked-project.json` targets `vgcafbzksizlwmylphzu`, the production project recorded in the onboarding document. `.env.staging` targets a different project, but it has no CLI database access path. Do not run `supabase db push` while linked to the production ref. Provide a staging project ref plus an authenticated, staging-only migration path, then run: dry-run/list → apply the two approved migrations → non-destructive rollback SQL → replay → targeted RPC checks. No production write was attempted.

2. **Atlas Cloud video is not provisioned.** `ATLASCLOUD_API_KEY` is absent from both local and staging environment files. The sprint explicitly prohibits hard-coded credentials and mock substitution, so a real single-Shot video run cannot start until the staging server receives this variable and quota is confirmed.

3. **The expected video-job migration/API does not exist in the reviewed baseline.** The only related migration is `20260716180000_unified_generation_jobs.sql`. It has `provider_task_id`, but no database-level idempotency key/unique constraint, no `source_unit_id` or episode binding, and only a polymorphic text target. There is no committed `video_jobs` migration, `POST /api/storyboard/shots/:shotId/generate-video`, or `GET .../video-job` contract to approve.

4. **The live implementation path is a legacy MiniMax direct flow, not the required Atlas image-to-video flow.** `generate-shot-video` sends the client-selected Shot straight to MiniMax and persists an external task id on the legacy production shot. `video-status` accepts a client-supplied provider task id. Neither route requires a confirmed storyboard image version as the first frame, creates a durable generation-job record before provider submission, nor binds a server-owned video artifact to the stable storyboard Shot.

5. **Provider CDN URLs are stored directly.** The legacy status route writes the provider video URL into `storyflow_production_shots.video_url`; it does not download and place the result into private Supabase Storage before binding. Expiring URLs make refresh, download, and ZIP export unreliable.

6. **The first-stage save gate is not fully closed.** `ProductionWorkbench` now uses the revision-aware storyboard client and applies `idMap`, but `lib/production/hooks.ts` still calls `/api/production/save-state`. The old MiniMax video routes also load and mutate that legacy production state. Until the video chain is rebuilt on stable Shot IDs (or the legacy call is removed from the active path), this is not a zero-residual save migration.

## MUST FIX

1. Create the video job from server-owned facts only: owner, project, `sourceUnitId`, stable Shot UUID, confirmed storyboard image-version ID, resolved stored first-frame object key, aspect ratio, provider/model, prompt version/input hash, and a server-generated idempotency key.

2. Enforce idempotency in the database, not with a pre-insert lookup. Use a scoped unique key such as `(owner_id, idempotency_key)` and return the existing non-terminal/complete job on conflict. The provider request must occur only after a durable job row exists; persist `provider_task_id` atomically before polling.

3. Replace the client-owned polling loop with a durable server job state. The status endpoint must look up the owned job, verify its stored provider task id, poll at a bounded interval, and never accept a task id as authority. Page unload must not cancel provider completion handling.

4. Add an Atlas-only thin adapter for this sprint: upload the confirmed first-frame image, submit `image_url`, prompt, duration and aspect ratio, and normalize provider statuses/errors. Keep `ATLASCLOUD_API_KEY` server-only; do not accept any provider credential or first-frame URL from the browser.

5. On completion, download the provider URL with bounded size/time checks, write an immutable object to private Supabase Storage, verify its SHA-256, then bind the stored object/version to the Shot. Preserve the previous confirmed video when regeneration fails; record a new version rather than clearing it.

6. Define a bounded batch endpoint: server-side concurrency limit, per-item state, retry eligibility, and an idempotency key per Shot/input hash. Do not fan out provider requests from browser tabs.

7. Extend export only after the stored artifact contract exists. ZIP must read the owned artifact objects, not provider CDN URLs.

## 可以继续

- `storyflow_generation_jobs` already supplies owner, provider, model, provider task id, result metadata, status, and target fields, so it can be extended rather than replaced if the migration preserves existing image jobs.
- `ProductionWorkbench` contains the intended `PUT /api/storyboard/state` integration, `idMap` application, and user-visible `REVISION_CONFLICT` presentation. Its staging regression is pending the migration gate.
- Current code reads provider keys from server environment variables rather than `NEXT_PUBLIC_*`; the reviewed source tree contains no literal credential. Keep this boundary when adding Atlas video.
